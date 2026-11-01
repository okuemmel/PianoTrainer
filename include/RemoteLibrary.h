#pragma once
#include <Arduino.h>
#include <ArduinoJson.h>
#include <freertos/FreeRTOS.h>
#include <freertos/stream_buffer.h>

#include <atomic>
class WiFiClient;

class RemoteLibrary {
 public:
  struct Request {
    String url, user, password, ca, postBody;
    String destination;
    uint32_t uploadSize = 0;
    bool listing = false, dav = false;
  };
  bool start(Request next);
  void cancel() {
    cancelled.store(true);
  }
  bool busy() const {
    return active.load();
  }
  uint32_t id() const {
    return jobId;
  }
  void status(JsonObject object) const;
  // Returns -1 for an invalid offset, otherwise a replayable chunk length.
  int chunk(uint32_t offset, const uint8_t*& data);
  // 1 accepted/replayed, 0 queue full (retry), -1 invalid or no active upload.
  int uploadChunk(uint32_t offset, const uint8_t* data, size_t length);

 private:
  class Sink;
  class Source;
  Request request;
  StreamBufferHandle_t buffer = nullptr;
  std::atomic<bool> active{false}, cancelled{false};
  std::atomic<uint32_t> received{0};
  std::atomic<int32_t> expected{-1};
  uint32_t jobId = 0, delivered = 0, cachedOffset = UINT32_MAX;
  uint32_t uploaded = 0;
  size_t cachedSize = 0;
  uint8_t cached[4096]{};
  char failure[160]{};
  bool listing = false;
  uint32_t deadline = 0;
  void perform();
  void performUpload(WiFiClient& client);
  static void task(void* context);
};
