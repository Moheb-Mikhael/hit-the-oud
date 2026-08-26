#pragma once

class StringVoice {
public:
    StringVoice(float sampleRate, float frequency);
    ~StringVoice();

    StringVoice(const StringVoice&) = delete;
    StringVoice& operator=(const StringVoice&) = delete;

    void pluck(float velocity, float brightness);
    void setFrequency(float frequency);
    void setSustain(bool active);
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
    float tone_;
    unsigned int rngState_;

    bool sustainActive_;
    float agcGain_;
    float envelopeFast_;
    float targetEnvelope_;
};
