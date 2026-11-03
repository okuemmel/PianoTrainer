#include "UsbHostProbe.h"

#if defined(TRAINER_USB_HOST) || defined(TRAINER_USB_HOST_PROBE)
#include <Arduino.h>
#include <esp_timer.h>
#include <usb/usb_host.h>

#include <atomic>

#include "MidiInput.h"
#include "UsbMidiProtocol.h"
namespace {
usb_host_client_handle_t client = nullptr;
usb_device_handle_t device = nullptr;
usb_transfer_t* inputTransfer = nullptr;
MidiInputs* midiInput = nullptr;
UsbMidiPackets packets;
UsbMidiEndpoint endpoint;
uint8_t address = 0;
bool gone = false, installed = false, interfaceClaimed = false, inFlight = false;
const char* state = "disabled";
unsigned vid = 0, pid = 0, connections = 0, receivedPackets = 0;
std::atomic<uint32_t> errors{0};

void daemon(void*) {
  while (true) {
    uint32_t flags = 0;
    const auto result = usb_host_lib_handle_events(pdMS_TO_TICKS(20), &flags);
    if (result != ESP_OK && result != ESP_ERR_TIMEOUT) ++errors;
    vTaskDelay(1);
  }
}

void transferDone(usb_transfer_t* transfer) {
  inFlight = false;
  if (transfer->status == USB_TRANSFER_STATUS_COMPLETED) {
    if (transfer->actual_num_bytes > 0) {
      ++receivedPackets;
      packets.receive(transfer->data_buffer, transfer->actual_num_bytes, esp_timer_get_time(),
                      [](const MidiEvent& event) {
                        if (midiInput) midiInput->receive(event);
                      });
    }
  } else if (transfer->status != USB_TRANSFER_STATUS_NO_DEVICE &&
             transfer->status != USB_TRANSFER_STATUS_CANCELED) {
    ++errors;
  }
  if (gone || transfer->status == USB_TRANSFER_STATUS_NO_DEVICE ||
      transfer->status == USB_TRANSFER_STATUS_CANCELED) {
    gone = true;
    state = "disconnected";
    return;
  }
  if (usb_host_transfer_submit(transfer) == ESP_OK) {
    inFlight = true;
    state = "receiving";
  } else {
    ++errors;
    state = "error";
  }
}

void event(const usb_host_client_event_msg_t* message, void*) {
  if (message->event == USB_HOST_CLIENT_EVENT_NEW_DEV)
    address = message->new_dev.address;
  else if (message->event == USB_HOST_CLIENT_EVENT_DEV_GONE && message->dev_gone.dev_hdl == device)
    gone = true;
}

void cleanupGoneDevice() {
  if (!device || inFlight) return;
  if (midiInput) midiInput->releaseSource(MidiSource::Usb);
  if (interfaceClaimed) usb_host_interface_release(client, device, endpoint.interfaceNumber);
  interfaceClaimed = false;
  if (inputTransfer) usb_host_transfer_free(inputTransfer);
  inputTransfer = nullptr;
  usb_host_device_close(client, device);
  device = nullptr;
  gone = false;
  vid = pid = 0;
  state = "disconnected";
  packets.reset();
}

bool beginReceive() {
  if (usb_host_interface_claim(client, device, endpoint.interfaceNumber, 0) != ESP_OK) {
    ++errors;
    state = "error";
    return false;
  }
  interfaceClaimed = true;
  if (usb_host_transfer_alloc(endpoint.packetSize, 0, &inputTransfer) != ESP_OK) {
    ++errors;
    state = "error";
    return false;
  }
  inputTransfer->device_handle = device;
  inputTransfer->bEndpointAddress = endpoint.address;
  inputTransfer->num_bytes = endpoint.packetSize;
  inputTransfer->timeout_ms = 0;
  inputTransfer->callback = transferDone;
  inputTransfer->context = nullptr;
  if (usb_host_transfer_submit(inputTransfer) != ESP_OK) {
    ++errors;
    state = "error";
    return false;
  }
  inFlight = true;
  state = "receiving";
  return true;
}
}  // namespace

void usbHostProbeStart(MidiInputs* midi) {
  if (midi) midiInput = midi;
  if (installed) return;
  usb_host_config_t config{};
  config.intr_flags = ESP_INTR_FLAG_LEVEL1;
  if (usb_host_install(&config) != ESP_OK) {
    state = "error";
    ++errors;
    return;
  }
  usb_host_client_config_t options{};
  options.max_num_event_msg = 5;
  options.async.client_event_callback = event;
  if (usb_host_client_register(&options, &client) != ESP_OK) {
    usb_host_uninstall();
    state = "error";
    ++errors;
    return;
  }
  if (xTaskCreate(daemon, "usb-host", 4096, nullptr, 2, nullptr) != pdPASS) {
    usb_host_client_deregister(client);
    client = nullptr;
    usb_host_uninstall();
    state = "error";
    ++errors;
    return;
  }
  installed = true;
  state = "waiting";
  Serial.println("[USB MIDI] Host aktiv; warte auf USB-MIDI-Gerät.");
}

void usbHostProbeLoop() {
  if (!client) return;
  const auto result = usb_host_client_handle_events(client, 0);
  if (result != ESP_OK && result != ESP_ERR_TIMEOUT) ++errors;
  if (gone) cleanupGoneDevice();
  if (!address) return;
  const auto nextAddress = address;
  address = 0;
  if (device) {
    ++errors;
    return;
  }
  if (usb_host_device_open(client, nextAddress, &device) != ESP_OK) {
    ++errors;
    state = "error";
    device = nullptr;
    return;
  }
  ++connections;
  const usb_device_desc_t* identity = nullptr;
  const usb_config_desc_t* descriptor = nullptr;
  if (usb_host_get_device_descriptor(device, &identity) != ESP_OK ||
      usb_host_get_active_config_descriptor(device, &descriptor) != ESP_OK) {
    ++errors;
    state = "error";
  } else {
    vid = identity->idVendor;
    pid = identity->idProduct;
    const auto parsed = usbMidiEndpoint(reinterpret_cast<const uint8_t*>(descriptor),
                                        descriptor->wTotalLength, endpoint);
    state = parsed == UsbMidiDescriptorResult::Ready ? "midi1-candidate" : "unsupported";
    Serial.printf("[USB MIDI] %04x:%04x %s interface=%u endpoint=%02x packet=%u\n", vid, pid,
                  state, endpoint.interfaceNumber, endpoint.address, endpoint.packetSize);
    if (parsed == UsbMidiDescriptorResult::Ready) beginReceive();
  }
}

void usbHostProbeStatus(JsonObject object) {
  object["available"] = true;
  object["state"] = state;
  object["vid"] = vid;
  object["pid"] = pid;
  object["connections"] = connections;
  object["errors"] = errors.load();
  object["receivesMidi"] = inFlight;
  object["rxPackets"] = receivedPackets;
  object["parserErrors"] = packets.malformed;
  object["unsupportedCable"] = packets.unsupportedCable;
}
#else
void usbHostProbeStart(MidiInputs*) {}
void usbHostProbeLoop() {}
void usbHostProbeStatus(JsonObject object) {
  object["available"] = false;
  object["state"] = "not-built";
  object["receivesMidi"] = false;
}
#endif
