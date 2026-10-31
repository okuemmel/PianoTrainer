# MIDI LED Piano Trainer

Target: ESP32-C3 SuperMini, 4 MB flash, native USB Serial/JTAG. Default LED output GPIO 4.
Keep Phase 1 functional without MIDI hardware. No USB host implementation on C3.
Keep portable mapping/validation in include/TrainerLogic.h and board-specific pins in BoardProfile.h.
Never log WLAN passwords or return credentials through HTTP. Device access password is displayed only on serial for local commissioning.
Use nonblocking millis-based state machines for Wi-Fi and animations. No external web assets.
After changes run `pio test -e native`, `pio run -e c3_supermini`, and `pio run -e c3_supermini -t buildfs` when applicable.
Document hardware tests separately from host/build checks. Do not claim physical tests without hardware.
