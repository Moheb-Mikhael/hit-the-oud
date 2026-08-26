#pragma once

class StringVoice {
public:
    StringVoice(float sampleRate, float frequency);
    ~StringVoice();

    StringVoice(const StringVoice&) = delete;
    StringVoice& operator=(const StringVoice&) = delete;

    void pluck(float velocity);
    void setFrequency(float frequency);
    void render(float* out, int frames);

    float frequency() const;

private:
    unsigned int nextRandom();

    float sampleRate_;
    float* buffer_;
    int capacity_;
    float delay_;
    float targetDelay_;
    float glideCoeff_;
    float writePos_;
    float damping_;
    unsigned int rngState_;
};
