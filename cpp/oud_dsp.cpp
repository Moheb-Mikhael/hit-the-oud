#include "oud_dsp.h"

#include <emscripten/bind.h>
#include <emscripten/val.h>

#include <algorithm>
#include <cmath>
#include <cstdint>
#include <cstring>

namespace {

constexpr float kMinFrequency = 40.0f;
constexpr float kMaxFrequency = 1200.0f;
constexpr float kGuardSamples = 8.0f;
constexpr float kDecaySeconds = 3.0f;
constexpr float kGlideSeconds = 0.004f;
constexpr int kMixCapacityFrames = 4096;

inline float clampFrequency(float frequency) {
    return std::min(std::max(frequency, kMinFrequency), kMaxFrequency);
}

inline float randomBipolar(unsigned int& state) {
    state ^= state << 13;
    state ^= state >> 17;
    state ^= state << 5;
    return (static_cast<float>(state & 0xFFFFu) / 65535.0f) * 2.0f - 1.0f;
}

}  // namespace

StringVoice::StringVoice(float sampleRate, float frequency)
    : sampleRate_(sampleRate),
      buffer_(nullptr),
      capacity_(0),
      delay_(0.0f),
      targetDelay_(0.0f),
      glideCoeff_(0.0f),
      writePos_(0.0f),
      damping_(0.999f),
      rngState_(static_cast<unsigned int>(reinterpret_cast<uintptr_t>(this)) ^
                static_cast<unsigned int>(frequency * 997.0f) ^ 0x9E3779B9u) {
    const float maxDelay = sampleRate_ / kMinFrequency + kGuardSamples;
    capacity_ = static_cast<int>(std::ceil(maxDelay));
    buffer_ = new float[capacity_]();
    glideCoeff_ = 1.0f - std::exp(-1.0f / (kGlideSeconds * sampleRate_));
    setFrequency(frequency);
    delay_ = targetDelay_;
}

StringVoice::~StringVoice() {
    delete[] buffer_;
}

unsigned int StringVoice::nextRandom() {
    rngState_ ^= rngState_ << 13;
    rngState_ ^= rngState_ >> 17;
    rngState_ ^= rngState_ << 5;
    return rngState_;
}

void StringVoice::pluck(float velocity) {
    const float amplitude = std::min(std::max(velocity, 0.05f), 1.0f);
    int length = static_cast<int>(delay_);
    if (length < 2) length = 2;
    if (length >= capacity_ - 1) length = capacity_ - 2;
    int start = static_cast<int>(writePos_) - length;
    while (start < 0) {
        start += capacity_;
    }
    float previous = randomBipolar(rngState_) * amplitude;
    for (int i = 0; i < length; ++i) {
        const float noise = randomBipolar(rngState_) * amplitude;
        const float softened = 0.5f * (noise + previous);
        previous = noise;
        buffer_[(start + i) % capacity_] = softened;
    }
}

void StringVoice::setFrequency(float frequency) {
    const float clamped = clampFrequency(frequency);
    targetDelay_ = sampleRate_ / clamped;
    damping_ = std::pow(10.0f, -3.0f / (clamped * kDecaySeconds));
}

float StringVoice::frequency() const {
    return sampleRate_ / targetDelay_;
}

void StringVoice::render(float* out, int frames) {
    const float capacity = static_cast<float>(capacity_);
    for (int i = 0; i < frames; ++i) {
        float readPos = writePos_ - delay_;
        while (readPos < 0.0f) {
            readPos += capacity;
        }
        const int index0 = static_cast<int>(readPos);
        const float frac = readPos - static_cast<float>(index0);
        int index1 = index0 + 1;
        if (index1 >= capacity_) {
            index1 -= capacity_;
        }
        const float s0 = buffer_[index0];
        const float s1 = buffer_[index1];
        out[i] = s0 + (s1 - s0) * frac;
        buffer_[static_cast<int>(writePos_)] =
            damping_ * 0.5f * (s0 + s1);
        writePos_ += 1.0f;
        if (writePos_ >= capacity) {
            writePos_ -= capacity;
        }
        delay_ += (targetDelay_ - delay_) * glideCoeff_;
    }
}

namespace {

class OudEngine {
public:
    OudEngine(float sampleRate, int numStrings)
        : sampleRate_(sampleRate),
          stringCount_(numStrings > 0 ? numStrings : 6),
          voices_(nullptr),
          mix_(nullptr),
          scratch_(nullptr),
          masterGain_(0.7f) {
        voices_ = new StringVoice*[stringCount_];
        const float openFrequencies[6] = {87.0f, 110.0f, 147.0f, 196.0f, 261.0f, 350.0f};
        for (int i = 0; i < stringCount_; ++i) {
            voices_[i] = new StringVoice(
                sampleRate_, openFrequencies[i % 6]);
        }
        mix_ = new float[kMixCapacityFrames]();
        scratch_ = new float[kMixCapacityFrames]();
    }

    ~OudEngine() {
        for (int i = 0; i < stringCount_; ++i) {
            delete voices_[i];
        }
        delete[] voices_;
        delete[] mix_;
        delete[] scratch_;
    }

    void pluckString(int index, float velocity) {
        if (index < 0 || index >= stringCount_) {
            return;
        }
        voices_[index]->pluck(velocity);
    }

    void setStringFrequency(int index, float frequency) {
        if (index < 0 || index >= stringCount_) {
            return;
        }
        voices_[index]->setFrequency(frequency);
    }

    float stringFrequency(int index) const {
        if (index < 0 || index >= stringCount_) {
            return 0.0f;
        }
        return voices_[index]->frequency();
    }

    int stringCount() const {
        return stringCount_;
    }

    void render(int frames) {
        if (frames > kMixCapacityFrames) {
            frames = kMixCapacityFrames;
        }
        std::memset(mix_, 0, sizeof(float) * static_cast<size_t>(frames));
        for (int v = 0; v < stringCount_; ++v) {
            voices_[v]->render(scratch_, frames);
            for (int i = 0; i < frames; ++i) {
                mix_[i] += scratch_[i];
            }
        }
        for (int i = 0; i < frames; ++i) {
            mix_[i] = std::tanh(mix_[i] * masterGain_);
        }
    }

    emscripten::val outputView(int frames) {
        if (frames > kMixCapacityFrames) {
            frames = kMixCapacityFrames;
        }
        return emscripten::val(
            emscripten::typed_memory_view(frames, mix_));
    }

private:
    float sampleRate_;
    int stringCount_;
    StringVoice** voices_;
    float* mix_;
    float* scratch_;
    float masterGain_;
};

}  // namespace

EMSCRIPTEN_BINDINGS(oud_dsp) {
    emscripten::class_<OudEngine>("OudEngine")
        .constructor<float, int>()
        .function("pluckString", &OudEngine::pluckString)
        .function("setStringFrequency", &OudEngine::setStringFrequency)
        .function("stringFrequency", &OudEngine::stringFrequency)
        .property("stringCount", &OudEngine::stringCount)
        .function("render", &OudEngine::render)
        .function("outputView", &OudEngine::outputView);
}

int main() {
    return 0;
}
