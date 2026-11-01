"""Image identities and immutable flash layouts supported by the update tools."""
import struct
PROFILES = {
    "c3_supermini": dict(target="esp32c3", layout="c3-v1", chip=5,
                         firmware_max=0x180000, filesystem_size=0xF0000,
                         filesystem_offset=0x310000, flash_size=0x400000,
                         partitions="partitions.csv", label="ESP32-C3 SuperMini, 4 MB"),
    "s3_n16r8": dict(target="esp32s3", layout="s3-n16r8-v1", chip=9,
                      firmware_max=0x400000, filesystem_size=0x7F0000,
                      filesystem_offset=0x810000, flash_size=0x1000000,
                      partitions="partitions_s3_n16r8.csv", label="ESP32-S3 DevC-1 N16R8, 16 MB / 8 MB PSRAM"),
}


def validate_image(data, kind, profile):
    if kind == "firmware":
        if (not 256 <= len(data) <= profile["firmware_max"] or data[0] != 0xE9 or
                int.from_bytes(data[12:14], "little") != profile["chip"]):
            raise ValueError("Firmware chip or size does not match the selected board")
    elif kind == "web":
        if len(data) != profile["filesystem_size"]:
            raise ValueError("Filesystem size does not match the selected board layout")
    else:
        raise ValueError("Unsupported update kind")


def partition_entries(profile):
    return {
        "nvs": (1, 2, 0x9000, 0x5000),
        "otadata": (1, 0, 0xE000, 0x2000),
        "app0": (0, 16, 0x10000, profile["firmware_max"]),
        "app1": (0, 17, 0x10000 + profile["firmware_max"], profile["firmware_max"]),
        "littlefs": (1, 130, profile["filesystem_offset"], profile["filesystem_size"]),
    }


def validate_partitions(data, profile):
    actual = {}
    for offset in range(0, len(data) - 31, 32):
        magic, kind, subtype, start, size, raw_name, flags = struct.unpack_from("<HBBII16sI", data, offset)
        if magic != 0x50AA:
            break
        name = raw_name.rstrip(b"\0").decode("ascii")
        if name in actual or flags:
            raise ValueError("Unexpected partition flags or duplicate labels")
        actual[name] = (kind, subtype, start, size)
    if actual != partition_entries(profile):
        raise ValueError("Partition image does not match the selected board layout")
