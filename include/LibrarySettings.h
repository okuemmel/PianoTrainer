#pragma once
#include <string>
#include <string_view>

inline bool validLibraryUrl(std::string_view url) {
  if (url.size() > 512) return false;
  size_t start = url.substr(0, 8) == "https://" ? 8 : url.substr(0, 7) == "http://" ? 7 : 0;
  if (!start) return false;
  auto end = url.find('/', start);
  auto authority = url.substr(start, end == url.npos ? url.size() - start : end - start);
  if (authority.empty() || authority.find('@') != authority.npos) return false;
  for (char c : url)
    if (static_cast<unsigned char>(c) <= 32 || c == '\\' || c == '#' || c == '?') return false;
  return true;
}
inline std::string libraryOrigin(std::string_view url) {
  auto end = url.find('/', url.find("://") + 3);
  return std::string(url.substr(0, end));
}
inline bool validMidiFilename(std::string_view name) {
  if (name.empty() || name.size() > 255) return false;
  for (char c : name)
    if (static_cast<unsigned char>(c) < 32 || c == '/' || c == '\\') return false;
  std::string lower(name);
  for (char& c : lower)
    if (c >= 'A' && c <= 'Z') c += 'a' - 'A';
  return (lower.size() > 4 && lower.substr(lower.size() - 4) == ".mid") ||
         (lower.size() > 5 && lower.substr(lower.size() - 5) == ".midi");
}
inline std::string libraryUrlEncode(std::string_view input) {
  std::string result;
  constexpr char hex[] = "0123456789ABCDEF";
  for (unsigned char c : input) {
    if ((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9') || c == '-' ||
        c == '_' || c == '.' || c == '~')
      result += char(c);
    else {
      result += '%';
      result += hex[c >> 4];
      result += hex[c & 15];
    }
  }
  return result;
}

inline bool validCollectionPath(std::string_view path) {
  if (path.size() > 512 || path.substr(0, 6) != "/midi/") return false;
  std::string lower(path);
  for (char& c : lower)
    if (c >= 'A' && c <= 'Z') c += 'a' - 'A';
  for (char c : path)
    if (static_cast<unsigned char>(c) <= 32 || c == '\\' || c == '?' || c == '#') return false;
  for (const auto* forbidden : {"..", "%2e", "%2f", "%5c", "%25", "%00"})
    if (lower.find(forbidden) != std::string::npos) return false;
  return validMidiFilename(path.substr(path.find_last_of('/') + 1));
}
