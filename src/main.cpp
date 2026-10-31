#include <Arduino.h>
#include <LittleFS.h>

#include "TrainerWebServer.h"
ConfigManager config;
WiFiManager wifi(config);
LedController leds;
TrainingController training(leds, config.led);
SimulatedMidiInput midi(training, config.led);
TrainerWebServer web(config, wifi, leds, midi, training);
bool ready = false;
uint32_t heldAt = 0;
void setup() {
  Serial.begin(115200);
  pinMode(9, INPUT_PULLUP);
  // Bounded USB enumeration wait; standalone startup also works.
  uint32_t start = millis();
  while (!Serial && millis() - start < 1500) delay(10);
  Serial.println("\nMIDI LED Piano Trainer / ESP32-C3 SuperMini");
  if (!config.begin()) {
    Serial.println("NVS-Fehler. Neustart erforderlich.");
    return;
  }
  Serial.println("Benutzer: admin");
  Serial.print("Gerätepasswort (Webanmeldung): ");
  Serial.println(config.accessPassword);
  if (!leds.configure(config.led)) {
    Serial.println("LED-Initialisierung fehlgeschlagen.");
    return;
  }
  // The partition label must match partitions.csv; the core defaults to "spiffs".
  bool fs = LittleFS.begin(false, "/littlefs", 10, "littlefs");
  if (!fs)
    Serial.println("LittleFS fehlt. Bitte uploadfs ausführen.");
  else
    Serial.println("LittleFS bereit.");
  wifi.begin();
  web.begin(fs);
  ready = true;
}
void loop() {
  if (ready) {
    wifi.loop();
    web.loop();
    midi.loop();
    training.loop();
    leds.loop();
    while (Serial.available()) {
      const char command = Serial.read();
      if (command == 't' || command == 'T') {
        midi.release();
        training.stop();
        leds.diagnostic();
      } else if (command == 'x' || command == 'X') {
        midi.release();
        training.stop();
        leds.off();
        Serial.println("[LED] Seriell ausgeschaltet.");
      }
    }
  }
  // Hold BOOT during normal operation, not during reset, for physical recovery.
  if (digitalRead(9) == LOW) {
    if (!heldAt) heldAt = millis();
    if (millis() - heldAt > 8000) {
      leds.off();
      if (config.reset()) ESP.restart();
    }
  } else
    heldAt = 0;
  delay(1);
}
