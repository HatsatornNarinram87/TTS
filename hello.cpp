// ChromeAudioCapture.cpp
// Compile (MSVC): cl ChromeAudioCapture.cpp /EHsc /link ole32.lib oleaut32.lib uuid.lib winmm.lib
// Compile (MinGW): g++ -o ChromeAudioCapture.exe ChromeAudioCapture.cpp -lole32 -loleaut32 -luuid -lwinmm -std=c++17

#define WIN32_LEAN_AND_MEAN
#define NOMINMAX
#include <windows.h>
#include <mmdeviceapi.h>
#include <audioclient.h>
#include <audiopolicy.h>
#include <tlhelp32.h>
#include <iostream>
#include <fstream>
#include <vector>
#include <thread>
#include <atomic>

#pragma comment(lib, "ole32.lib")
#pragma comment(lib, "oleaut32.lib")
#pragma comment(lib, "uuid.lib")
#pragma comment(lib, "winmm.lib")

#include <filesystem> // เพิ่ม include นี้ด้านบน

// ── หาชื่อไฟล์ถัดไป ──────────────────────────
std::string GetNextFilename(const std::string &dir)
{
  int maxNum = 0;
  for (const auto &entry : std::filesystem::directory_iterator(dir))
  {
    std::string name = entry.path().stem().string(); // ชื่อไม่มีนามสกุล
    try
    {
      int num = std::stoi(name);
      if (num > maxNum)
        maxNum = num;
    }
    catch (...)
    {
      // ไม่ใช่ตัวเลข ข้ามไป
    }
  }
  return dir + "/" + std::to_string(maxNum + 1) + ".wav";
}
// ────────────────────────────────────────────────
// WAV Header
// ────────────────────────────────────────────────
struct WavHeader
{
  char riff[4] = {'R', 'I', 'F', 'F'};
  uint32_t chunkSize = 0;
  char wave[4] = {'W', 'A', 'V', 'E'};
  char fmt[4] = {'f', 'm', 't', ' '};
  uint32_t subchunk1Size = 16;
  uint16_t audioFormat = 3; // IEEE_FLOAT
  uint16_t numChannels = 2;
  uint32_t sampleRate = 48000;
  uint32_t byteRate = 0;
  uint16_t blockAlign = 0;
  uint16_t bitsPerSample = 32;
  char data[4] = {'d', 'a', 't', 'a'};
  uint32_t dataSize = 0;
};

void writeWavHeader(std::fstream &f, const WAVEFORMATEX *wfx, uint32_t dataBytes)
{
  WavHeader h;
  h.numChannels = wfx->nChannels;
  h.sampleRate = wfx->nSamplesPerSec;
  h.bitsPerSample = wfx->wBitsPerSample;
  h.audioFormat = (wfx->wBitsPerSample == 32) ? 3 : 1;
  h.blockAlign = h.numChannels * (h.bitsPerSample / 8);
  h.byteRate = h.sampleRate * h.blockAlign;
  h.dataSize = dataBytes;
  h.chunkSize = 36 + dataBytes;
  f.seekp(0);
  f.write(reinterpret_cast<char *>(&h), sizeof(h));
}

// ────────────────────────────────────────────────
// หา PID ของ chrome.exe ทั้งหมด
// ────────────────────────────────────────────────
std::vector<DWORD> GetChromePIDs()
{
  std::vector<DWORD> pids;
  HANDLE snap = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
  if (snap == INVALID_HANDLE_VALUE)
    return pids;

  PROCESSENTRY32W pe = {sizeof(pe)};
  if (Process32FirstW(snap, &pe))
  {
    do
    {
      if (_wcsicmp(pe.szExeFile, L"chrome.exe") == 0)
        pids.push_back(pe.th32ProcessID);
    } while (Process32NextW(snap, &pe));
  }
  CloseHandle(snap);
  return pids;
}

// ────────────────────────────────────────────────
// Capture Loop (WASAPI Loopback)
// ────────────────────────────────────────────────
std::atomic<bool> g_running(true);

void CaptureLoop(IAudioClient *pClient,
                 IAudioCaptureClient *pCap,
                 const std::string &outFile, // <-- เปลี่ยนตรงนี้
                 const WAVEFORMATEX *wfx)
{
  std::fstream wav(outFile, // <-- ใช้ได้เลย ไม่ต้องแปลง
                   std::ios::binary | std::ios::out |
                       std::ios::in | std::ios::trunc);
  if (!wav.is_open())
  {
    std::wcerr << L"[ERROR] Cannot open output file\n";
    return;
  }

  // จอง space สำหรับ header ก่อน
  WavHeader placeholder;
  wav.write(reinterpret_cast<char *>(&placeholder), sizeof(placeholder));

  uint32_t totalBytes = 0;
  HANDLE hEvent = CreateEvent(nullptr, FALSE, FALSE, nullptr);
  pClient->SetEventHandle(hEvent);
  pClient->Start();

  std::wcout << L"[*] Recording... Press Enter to stop.\n";

  while (g_running.load())
  {
    WaitForSingleObject(hEvent, 100);

    UINT32 packetSize = 0;
    while (SUCCEEDED(pCap->GetNextPacketSize(&packetSize)) && packetSize > 0)
    {
      BYTE *data = nullptr;
      UINT32 frames = 0;
      DWORD flags = 0;

      if (FAILED(pCap->GetBuffer(&data, &frames, &flags, nullptr, nullptr)))
        break;

      UINT32 bytes = frames * wfx->nBlockAlign;

      if (flags & AUDCLNT_BUFFERFLAGS_SILENT)
      {
        std::vector<BYTE> silence(bytes, 0);
        wav.write(reinterpret_cast<char *>(silence.data()), bytes);
      }
      else
      {
        wav.write(reinterpret_cast<char *>(data), bytes);
      }

      totalBytes += bytes;
      pCap->ReleaseBuffer(frames);
    }
  }

  pClient->Stop();
  CloseHandle(hEvent);

  // เขียน WAV header จริง
  writeWavHeader(wav, wfx, totalBytes);
  wav.close();

  std::cout << "[+] Saved: " << outFile // <-- wcout -> cout
            << "  (" << totalBytes / 1024 << " KB)\n";
}

// ────────────────────────────────────────────────
// main
// ────────────────────────────────────────────────
int main()
{
  CoInitializeEx(nullptr, COINIT_MULTITHREADED);

  auto chromePIDs = GetChromePIDs();
  if (chromePIDs.empty())
  {
    std::wcerr << L"[ERROR] ไม่พบ chrome.exe\n";
    CoUninitialize();
    return 1;
  }
  std::cout << "[+] Found " << chromePIDs.size() << " chrome.exe\n";

  IMMDeviceEnumerator *pEnum = nullptr;
  IMMDevice *pDevice = nullptr;
  IAudioClient *pClient = nullptr;
  IAudioCaptureClient *pCap = nullptr;

  HRESULT hr;

  hr = CoCreateInstance(__uuidof(MMDeviceEnumerator), nullptr,
                        CLSCTX_ALL, __uuidof(IMMDeviceEnumerator),
                        reinterpret_cast<void **>(&pEnum));
  if (FAILED(hr))
  {
    std::cerr << "[ERROR] CoCreateInstance failed: " << std::hex << hr << "\n";
    return 1;
  }
  std::cout << "[+] Got DeviceEnumerator\n";

  hr = pEnum->GetDefaultAudioEndpoint(eRender, eConsole, &pDevice);
  if (FAILED(hr))
  {
    std::cerr << "[ERROR] GetDefaultAudioEndpoint failed: " << std::hex << hr << "\n";
    return 1;
  }
  std::cout << "[+] Got AudioEndpoint\n";

  hr = pDevice->Activate(__uuidof(IAudioClient), CLSCTX_ALL,
                         nullptr, reinterpret_cast<void **>(&pClient));
  if (FAILED(hr))
  {
    std::cerr << "[ERROR] Activate failed: " << std::hex << hr << "\n";
    return 1;
  }
  std::cout << "[+] Got AudioClient\n";

  WAVEFORMATEX *wfx = nullptr;
  hr = pClient->GetMixFormat(&wfx);
  if (FAILED(hr))
  {
    std::cerr << "[ERROR] GetMixFormat failed: " << std::hex << hr << "\n";
    return 1;
  }
  std::cout << "[+] Format: " << wfx->nChannels << "ch  "
            << wfx->nSamplesPerSec << "Hz  "
            << wfx->wBitsPerSample << "bit\n";

  hr = pClient->Initialize(
      AUDCLNT_SHAREMODE_SHARED,
      AUDCLNT_STREAMFLAGS_LOOPBACK | AUDCLNT_STREAMFLAGS_EVENTCALLBACK,
      10000000, 0, wfx, nullptr);
  if (FAILED(hr))
  {
    std::cerr << "[ERROR] Initialize failed: " << std::hex << hr << "\n";
    return 1;
  }
  std::cout << "[+] AudioClient initialized\n";

  hr = pClient->GetService(__uuidof(IAudioCaptureClient),
                           reinterpret_cast<void **>(&pCap));
  if (FAILED(hr))
  {
    std::cerr << "[ERROR] GetService failed: " << std::hex << hr << "\n";
    return 1;
  }
  std::cout << "[+] Got CaptureClient\n";
  // สร้างโฟลเดอร์ถ้ายังไม่มี
  std::filesystem::create_directories("./voices");

  std::string outFile = GetNextFilename("./voices");
  std::cout << "[+] Output: " << outFile << "\n";

  std::thread recThread(CaptureLoop, pClient, pCap, outFile, wfx);

  std::thread inputThread([]()
                          {
    char c;
    std::cin.read(&c, 1);
    g_running = false; });

  inputThread.join();
  recThread.join();

  CoTaskMemFree(wfx);
  pCap->Release();
  pClient->Release();
  pDevice->Release();
  pEnum->Release();
  CoUninitialize();
  return 0;
}
