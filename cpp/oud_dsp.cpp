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
constexpr float kBassDecaySeconds = 3.6f;
constexpr float kTrebleDecaySeconds = 2.4f;
constexpr float kLowestCourseHz = 87.0f;
constexpr float kHighestCourseHz = 350.0f;
constexpr float kGlideSeconds = 0.004f;
constexpr int kMixCapacityFrames = 4096;

inline float clampFrequency(float frequency) {
    return std::min(std::max(frequency, kMinFrequency), kMaxFrequency);
}

inline float pitchPosition(float frequency) {
    const float low = std::log2(kLowestCourseHz);
    const float high = std::log2(kHighestCourseHz);
    const float position =
        (std::log2(clampFrequency(frequency)) - low) / (high - low);
    return std::min(std::max(position, 0.0f), 1.0f);
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
      tone_(0.5f),
      rngState_(static_cast<unsigned int>(reinterpret_cast<uintptr_t>(this)) ^
                static_cast<unsigned int>(frequency * 997.0f) ^ 0x9E3779B9u),
      sustainActive_(false),
      agcGain_(1.0f),
      envelopeFast_(0.0f),
      targetEnvelope_(0.0f) {
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

void StringVoice::pluck(float velocity, float brightness) {
    const float amplitude = std::min(std::max(velocity, 0.05f), 1.0f);
    const float bright = std::min(std::max(brightness, 0.0f), 1.0f);
    int length = static_cast<int>(delay_);
    if (length < 2) length = 2;
    if (length >= capacity_ - 1) length = capacity_ - 2;
    int start = static_cast<int>(writePos_) - length;
    while (start < 0) {
        start += capacity_;
    }
    const int filterStages =
        1 + static_cast<int>((1.0f - bright) * 3.0f + 0.5f);
    float stageHistory[4] = {0.0f, 0.0f, 0.0f, 0.0f};
    for (int i = 0; i < length; ++i) {
        float value = randomBipolar(rngState_) * amplitude;
        for (int s = 0; s < filterStages; ++s) {
            value = 0.5f * (value + stageHistory[s]);
            stageHistory[s] = value;
        }
        buffer_[(start + i) % capacity_] = value;
    }
    envelopeFast_ = 0.0f;
    targetEnvelope_ = amplitude * 0.28f;
    agcGain_ = 1.0f;
}

void StringVoice::setFrequency(float frequency) {
    const float clamped = clampFrequency(frequency);
    targetDelay_ = sampleRate_ / clamped;
    const float decaySeconds = kBassDecaySeconds -
        (kBassDecaySeconds - kTrebleDecaySeconds) * pitchPosition(clamped);
    damping_ = std::pow(10.0f, -3.0f / (clamped * decaySeconds));
    tone_ = 0.30f + 0.45f * pitchPosition(clamped);
}

void StringVoice::setSustain(bool active) {
    sustainActive_ = active;
    if (active) {
        envelopeFast_ = 0.0f;
    }
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
        const float stage1 = 0.5f * (s0 + s1);
        const float stage2 = 0.5f * (stage1 + s0);
        float feedback = tone_ * stage1 + (1.0f - tone_) * stage2;
        if (sustainActive_) {
            envelopeFast_ += 0.02f * (std::fabs(out[i]) - envelopeFast_);
            const float error =
                (targetEnvelope_ - envelopeFast_) / (targetEnvelope_ + 1e-9f);
            agcGain_ *= 1.0f + std::min(std::max(error, -0.0006f), 0.0006f);
            agcGain_ = std::min(std::max(agcGain_, 0.70f), 1.12f);
            feedback *= agcGain_;
        } else {
            feedback *= damping_;
        }
        feedback = std::min(std::max(feedback, -1.0f), 1.0f);
        buffer_[static_cast<int>(writePos_)] = feedback;
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
        const float courseFrequencies[6] = {87.0f, 110.0f, 147.0f, 196.0f, 261.0f, 350.0f};
        for (int i = 0; i < stringCount_; ++i) {
            voices_[i] = new StringVoice(
                sampleRate_, courseFrequencies[(i >> 1) % 6]);
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

    void pluckString(int index, float velocity, float brightness) {
        if (index < 0 || index >= stringCount_) {
            return;
        }
        voices_[index]->pluck(velocity, brightness);
    }

    void setStringFrequency(int index, float frequency) {
        if (index < 0 || index >= stringCount_) {
            return;
        }
        voices_[index]->setFrequency(frequency);
    }

    bool validCourse(int index) const {
        return index >= 0 && index * 2 + 1 < stringCount_;
    }

    void pluckCourse(int index, float velocity, float brightness) {
        if (!validCourse(index)) {
            return;
        }
        voices_[index * 2]->pluck(velocity, brightness);
        voices_[index * 2 + 1]->pluck(velocity, brightness);
    }

    void setCourseFrequency(int index, float frequency) {
        if (!validCourse(index)) {
            return;
        }
        voices_[index * 2]->setFrequency(frequency);
        voices_[index * 2 + 1]->setFrequency(frequency);
    }

    void setCourseSustain(int index, bool active) {
        if (!validCourse(index)) {
            return;
        }
        voices_[index * 2]->setSustain(active);
        voices_[index * 2 + 1]->setSustain(active);
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
        .function("pluckCourse", &OudEngine::pluckCourse)
        .function("setCourseFrequency", &OudEngine::setCourseFrequency)
        .function("setCourseSustain", &OudEngine::setCourseSustain)
        .function("stringFrequency", &OudEngine::stringFrequency)
        .property("stringCount", &OudEngine::stringCount)
        .function("render", &OudEngine::render)
        .function("outputView", &OudEngine::outputView);
}

int main() {
    return 0;
}
