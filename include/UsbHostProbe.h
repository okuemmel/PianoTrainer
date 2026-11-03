#pragma once
#include <ArduinoJson.h>
// USB MIDI host service (normal S3 build); probe-only builds may omit MidiInputs.
class MidiInputs;
void usbHostProbeStart(MidiInputs* midi = nullptr);
void usbHostProbeLoop();
void usbHostProbeStatus(JsonObject object);
