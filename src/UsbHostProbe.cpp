#include "UsbHostProbe.h"
#if defined(TRAINER_USB_HOST_PROBE)
#include <Arduino.h>
#include <usb/usb_host.h>

#include <atomic>

#include "UsbMidiProtocol.h"
namespace {
usb_host_client_handle_t client = nullptr;
usb_device_handle_t device = nullptr;
uint8_t address = 0;
bool gone = false, installed = false;
const char* state = "disabled";
unsigned vid = 0, pid = 0, connections = 0;
std::atomic<uint32_t> errors{0};
void daemon(void*) {
  while (true) {
    uint32_t flags = 0;
    const auto result = usb_host_lib_handle_events(pdMS_TO_TICKS(20), &flags);
    if (result != ESP_OK && result != ESP_ERR_TIMEOUT) ++errors;
    vTaskDelay(1);
  }
}
void event(const usb_host_client_event_msg_t* message, void*) {
  if (message->event == USB_HOST_CLIENT_EVENT_NEW_DEV)
    address = message->new_dev.address;
  else if (message->event == USB_HOST_CLIENT_EVENT_DEV_GONE && message->dev_gone.dev_hdl == device)
    gone = true;
}
}  // namespace
void usbHostProbeStart() {
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
  if (xTaskCreate(daemon, "usb-probe", 4096, nullptr, 2, nullptr) != pdPASS) {
    usb_host_client_deregister(client);
    client = nullptr;
    usb_host_uninstall();
    state = "error";
    ++errors;
    return;
  }
  installed = true;
  state = "waiting";
  Serial.println("[USB probe] Enumeration only; MIDI input not enabled. Reset to stop.");
}
void usbHostProbeLoop() {
  if (!client) return;
  const auto result = usb_host_client_handle_events(client, 0);
  if (result != ESP_OK && result != ESP_ERR_TIMEOUT) ++errors;
  if (gone) {
    if (device) usb_host_device_close(client, device);
    device = nullptr;
    gone = false;
    vid = pid = 0;
    state = "disconnected";
  }
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
    return;
  }
  ++connections;
  const usb_device_desc_t* identity = nullptr;
  const usb_config_desc_t* config = nullptr;
  if (usb_host_get_device_descriptor(device, &identity) != ESP_OK ||
      usb_host_get_active_config_descriptor(device, &config) != ESP_OK) {
    ++errors;
    state = "error";
  } else {
    vid = identity->idVendor;
    pid = identity->idProduct;
    UsbMidiEndpoint endpoint;
    const auto parsed =
        usbMidiEndpoint(reinterpret_cast<const uint8_t*>(config), config->wTotalLength, endpoint);
    state = parsed == UsbMidiDescriptorResult::Ready ? "midi1-candidate" : "unsupported";
    Serial.printf("[USB probe] %04x:%04x %s interface=%u endpoint=%02x packet=%u\n", vid, pid,
                  state, endpoint.interfaceNumber, endpoint.address, endpoint.packetSize);
  }
  // Keep the handle open to observe DEV_GONE; it is closed before any reuse.
}
void usbHostProbeStatus(JsonObject object) {
  object["available"] = true;
  object["state"] = state;
  object["vid"] = vid;
  object["pid"] = pid;
  object["connections"] = connections;
  object["errors"] = errors.load();
  object["receivesMidi"] = false;
}
#else
void usbHostProbeStart() {}
void usbHostProbeLoop() {}
void usbHostProbeStatus(JsonObject object) {
  object["available"] = false;
  object["state"] = "not-built";
  object["receivesMidi"] = false;
}
#endif
