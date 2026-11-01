#pragma once
#include <Arduino.h>
#include <esp_timer.h>
#if defined(TRAINER_BOARD_S3_N16R8)
#include <driver/uart.h>
#endif
#include "MidiByteParser.h"
#include "MidiRouter.h"
#include "TrainingController.h"

// All processing and TrainingController calls run in the Arduino loop owner.
class MidiInputs {
 public:
  MidiInputs(TrainingController& training, const LedConfig& config)
      : training(training), config(config) {}
  MidiRouter router;
  MidiSource selected = MidiSource::Web;
  int rxPin = -1;
  uint32_t dinBytes = 0, overruns = 0, senseTimeouts = 0;
  bool configure(MidiSource source, int pin, String& error) {
    if (source == MidiSource::Usb) {
      error = "USB-MIDI-Host ist noch nicht aktiviert.";
      return false;
    }
    if (source == MidiSource::Din) {
#if defined(TRAINER_BOARD_S3_N16R8)
      if (!BoardProfile::validLedPin(pin) || pin == config.pin) {
        error = "MIDI-RX-Pin ist gesperrt oder bereits für LEDs belegt.";
        return false;
      }
#else
      error = "DIN-MIDI benötigt das S3-Profil.";
      return false;
#endif
    }
    release();
    training.pause();
    stopDin();
    selected = MidiSource::Web;
    hasLastNote = false;
    lastInputUs = 0;
#if defined(TRAINER_BOARD_S3_N16R8)
    if (source == MidiSource::Din) {
      uart_config_t settings{};
      settings.baud_rate = 31250;
      settings.data_bits = UART_DATA_8_BITS;
      settings.parity = UART_PARITY_DISABLE;
      settings.stop_bits = UART_STOP_BITS_1;
      settings.flow_ctrl = UART_HW_FLOWCTRL_DISABLE;
      settings.source_clk = UART_SCLK_APB;
      if (uart_param_config(UART_NUM_1, &settings) != ESP_OK ||
          uart_set_pin(UART_NUM_1, UART_PIN_NO_CHANGE, pin, UART_PIN_NO_CHANGE,
                       UART_PIN_NO_CHANGE) != ESP_OK ||
          uart_driver_install(UART_NUM_1, 2048, 0, 8, &uartEvents, 0) != ESP_OK) {
        error = "MIDI-UART konnte nicht gestartet werden. Virtuelle Tastatur bleibt aktiv.";
        return false;
      }
      rxPin = pin;
      selected = source;
    }
#endif
    return true;
  }
  void receive(MidiEvent event) {
    if (event.source != selected) return;
    event.receivedUs = esp_timer_get_time();
    dispatch(event);
    if (event.source == MidiSource::Web) keepAlive();
  }
  void keepAlive() {
    last = millis();
    active = true;
  }
  void releaseWeb() {
    router.release(MidiSource::Web, esp_timer_get_time(),
                   [this](const MidiEvent& e) { training.receive(e); });
    active = training.engine.running();
    last = millis();
  }
  void release() {
    router.clear();
    training.release();
    active = training.engine.running();
    last = millis();
  }
  void loop() {
#if defined(TRAINER_BOARD_S3_N16R8)
    if (rxPin >= 0) {
      uart_event_t event;
      // Bound work per frame, even under continuous input or an error storm.
      for (int i = 0; i < 8 && xQueueReceive(uartEvents, &event, 0); ++i) {
        if (event.type == UART_FIFO_OVF || event.type == UART_BUFFER_FULL ||
            event.type == UART_PARITY_ERR || event.type == UART_FRAME_ERR ||
            event.type == UART_BREAK) {
          ++overruns;
          uart_flush_input(UART_NUM_1);
          resetDin();
        }
      }
      uint8_t bytes[128];
      const int count = uart_read_bytes(UART_NUM_1, bytes, sizeof(bytes), 0);
      if (count > 0) {
        dinBytes += count;
        for (int i = 0; i < count; ++i) {
          const uint64_t nowUs = esp_timer_get_time();
          lastInputUs = nowUs;
          if (senseArmed) lastDinUs = nowUs;
          din.feed(bytes[i], nowUs, [this](const MidiEvent& e) {
            if (e.type == MidiEventType::ActiveSensing) {
              senseArmed = true;
              lastDinUs = e.receivedUs;
            }
            dispatch(e);
          });
        }
      }
      if (senseArmed && esp_timer_get_time() - lastDinUs > 300000) {
        ++senseTimeouts;
        resetDin();
      }
    }
#endif
    if (selected == MidiSource::Web && active && millis() - last > 3000) {
      releaseWeb();
      training.pause();
      active = false;
    }
  }
  void status(JsonObject object) const {
    object["source"] = midiSourceName(selected);
    object["state"] = selected == MidiSource::Web ? "virtual" : "listening";
    object["rxPin"] = rxPin;
#if defined(TRAINER_BOARD_S3_N16R8)
    object["dinSupported"] = true;
#else
    object["dinSupported"] = false;
#endif
    object["usbSupported"] = false;
    object["events"] = router.received;
    object["filtered"] = router.filtered;
    object["rejected"] = router.rejected;
    object["held"] = router.heldNotes();
    object["dinBytes"] = dinBytes;
    object["parserErrors"] = din.malformed;
    object["overruns"] = overruns;
    object["senseTimeouts"] = senseTimeouts;
    object["lastNote"] = hasLastNote ? lastNote.note : -1;
    object["lastChannel"] = hasLastNote ? lastNote.channel : 0;
    object["lastVelocity"] = hasLastNote ? lastNote.velocity : 0;
    object["lastAgeMs"] =
        hasLastNote ? uint32_t((esp_timer_get_time() - lastNote.receivedUs) / 1000) : 0;
    object["activityAgeMs"] =
        lastInputUs ? uint32_t((esp_timer_get_time() - lastInputUs) / 1000) : UINT32_MAX;
  }

 private:
  TrainingController& training;
  const LedConfig& config;
  MidiByteParser din{MidiSource::Din};
  MidiEvent lastNote;
  bool hasLastNote = false;
  uint32_t last = 0;
  bool active = false, senseArmed = false;
  uint64_t lastDinUs = 0;
  uint64_t lastInputUs = 0;
#if defined(TRAINER_BOARD_S3_N16R8)
  QueueHandle_t uartEvents = nullptr;
#endif
  void dispatch(const MidiEvent& event) {
    lastInputUs = event.receivedUs;
    if (event.source == MidiSource::Din && event.type == MidiEventType::SourceReset)
      senseArmed = false;
    if (event.type == MidiEventType::NoteOn || event.type == MidiEventType::NoteOff) {
      lastNote = event;
      hasLastNote = true;
      if (training.previewActive() || training.engine.state == TrainingState::Paused ||
          training.engine.state == TrainingState::Completed) {
        router.clear();
        return;
      }
    }
    router.receive(event, config.channel, [this](const MidiEvent& e) { training.receive(e); });
  }
  void resetDin() {
    din.reset();
    senseArmed = false;
    router.release(MidiSource::Din, esp_timer_get_time(),
                   [this](const MidiEvent& e) { training.receive(e); });
  }
  void stopDin() {
#if defined(TRAINER_BOARD_S3_N16R8)
    if (rxPin >= 0) {
      uart_driver_delete(UART_NUM_1);
      uartEvents = nullptr;
    }
#endif
    rxPin = -1;
    resetDin();
  }
};
