#pragma once
#include <ArduinoJson.h>
// Enumeration-only diagnostic build. No transfer submissions or VBUS GPIO guessing.
void usbHostProbeStart();
void usbHostProbeLoop();
void usbHostProbeStatus(JsonObject object);
