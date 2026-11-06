"""YIN-style period estimation independent of the selected target note.

Uses a constant comparison window and cumulative mean normalized difference
as described in de Cheveigne & Kawahara (2002), doi:10.1121/1.1458024.
"""
import numpy as np


def fundamental(frame, rate, minimum=65, maximum=1200):
    signal = frame - np.mean(frame)
    low, high = max(2, int(rate / maximum)), min(int(rate / minimum), len(signal)//2-1)
    window = len(signal) - high
    fft_size = 1 << (2*len(signal)-1).bit_length()
    # Cross-correlation of a fixed prefix with its shifted copies. Unlike
    # variable-overlap autocorrelation, every lag compares the same length.
    prefix_fft = np.fft.rfft(signal[:window], n=fft_size)
    full_fft = np.fft.rfft(signal, n=fft_size)
    correlation = np.fft.irfft(prefix_fft.conj()*full_fft, n=fft_size)[:high+1]
    energy = np.concatenate(([0.], np.cumsum(signal**2)))
    difference = np.maximum(0, energy[window] + energy[window:window+high+1] - energy[:high+1] - 2*correlation)
    normalized = np.ones(high+1)
    normalized[1:] = difference[1:]*np.arange(1,high+1)/np.maximum(np.cumsum(difference[1:]),1e-12)
    candidates = np.where((normalized[1:-1] < normalized[:-2]) & (normalized[1:-1] <= normalized[2:]))[0]+1
    candidates = candidates[candidates>=low]
    good = candidates[normalized[candidates]<.15]
    if len(good):
        lag = int(good[0])
    elif len(candidates) and np.min(normalized[candidates])<.25:
        lag = int(candidates[np.argmin(normalized[candidates])])
    else:
        return None
    a,b,c = normalized[lag-1:lag+2]
    denominator = a-2*b+c
    shift = .5*(a-c)/denominator if abs(denominator)>1e-12 else 0
    frequency = float(rate/(lag+np.clip(shift,-.5,.5)))
    return frequency if minimum<=frequency<=maximum else None
