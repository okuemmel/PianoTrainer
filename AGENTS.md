# MIDI LED Piano Trainer

v2 target: user-specified ESP32-S3 DevC-1-N16R8-S3, assumed WROOM-1 N16R8 (16 MB QSPI flash, 8 MB OPI PSRAM). Confirm carrier/module markings before hardware acceptance. Default LED output GPIO 4 remains a candidate pending wiring verification.
Work on feature branches based on develop/v2. main and v1 tags remain stable; no main merge without explicit user approval.
Phase 1 is the existing application port. Keep simulation functional without MIDI hardware; real UART/USB MIDI belongs to Phase 2. No USB host implementation on C3.
Retain c3_supermini as a v1 regression build during migration. Never flash an S3 image to the attached C3. S3 hardware parity requires actual device tests, not a successful build.
Keep portable mapping/validation in include/TrainerLogic.h and board-specific pins in BoardProfile.h.
Never log WLAN passwords or return credentials through HTTP. Device access password is displayed only on serial for local commissioning.
Use nonblocking millis-based state machines for Wi-Fi and animations. No external web assets.
After changes run `pio test -e native`, `pio test -e native_s3`, `pio run -e s3_n16r8`, and `pio run -e s3_n16r8 -t buildfs` when applicable. Also run the C3 firmware/filesystem regression builds for changes shared with C3, plus relevant Node/Python tests.
Document hardware tests separately from host/build checks. Do not claim physical tests without hardware.

Maintain CHANGELOG.md automatically as part of every user-visible change. Record the current AppInfo version, date, and a clear description of the change before committing; include the changelog in the same commit. The user should not have to request changelog maintenance again. Use tools/update_changelog.py --message-file PATH when helpful, and keep historical entries intact. Do not install hooks that amend commits or leave the changelog staged after the commit.
