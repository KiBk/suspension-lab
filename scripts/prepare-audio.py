#!/usr/bin/env python3
"""Rebuild local recording loops; requires ffmpeg and NumPy. No network access.
RPM anchors are approximate sound-design choices, not measured engine telemetry.
"""
import hashlib, json, subprocess, wave
from pathlib import Path
import numpy as np
ROOT=Path(__file__).resolve().parents[1]; SR=24000
# id, source, segment seconds, approximate RPM anchor, tracked engine order Hz.
CLIPS=[
 ('petrol-idle','petrol-run',.3,1.8,900,(25,35)),
 ('petrol-low','petrol-run',2.7,3.3,2500,(65,105)),
 ('petrol-mid','petrol-run',8.1,10.8,4000,(120,145)),
 ('petrol-high','petrol-run',12.2,14.6,5400,(160,190)),
 ('diesel-idle','diesel-idle',.2,2.9,840,(26,30)),
 ('diesel-low','diesel-low',.15,1.95,1470,(46,51)),
 ('diesel-mid','diesel-mid',.2,2.6,2010,(64,70)),
 ('diesel-high','diesel-high',.15,1.85,2550,(80,90)),
 ('v8-idle','v8-run',.35,1.9,900,None),
 ('v8-low','v8-run',4.05,4.95,1800,None),
 ('v8-high','v8-run',3.12,3.65,3200,None),
 ('sports-idle','sports-run',2.9,4.0,1200,(55,64)),
 ('sports-low','sports-run',1.7,2.3,1500,(65,85)),
 ('sports-mid','sports-run',4.55,5.2,4200,(185,245)),
 ('sports-high','sports-run',5.4,6.15,5200,(245,275)),
 ('tyre-skid','tyre-skid-original',0,3,0,None),
]

def stabilize(x,band):
 # Track the strongest known engine order every 15 ms. A smooth time warp
 # removes the recorded throttle sweep while retaining the recorded timbre.
 half=2400; times=np.arange(half,len(x)-half,360)
 if len(times)<2:return x
 freq=np.fft.rfftfreq(32768,1/SR); mask=np.where((freq>=band[0])&(freq<=band[1]))[0]
 track=[]
 for t in times:
  spec=abs(np.fft.rfft(x[t-half:t+half]*np.hanning(half*2),n=32768))
  k=mask[np.argmax(spec[mask])];track.append(freq[k])
 track=np.array(track);track=np.convolve(np.pad(track,(2,2),mode='edge'),np.ones(5)/5,mode='valid')
 local=np.interp(np.arange(len(x)),times,track)
 phase=np.cumsum(local/np.median(track))
 return np.interp(np.arange(phase[0],phase[-1]),phase,x)

manifest={'sampleRate':SR,'format':'mono PCM16 WAV','loops':[]}
for name,source,start,end,rpm,band in CLIPS:
 path=ROOT/'assets/source/audio'/f'{source}.{"wav" if source=="tyre-skid-original" else "mp3"}'
 filters='highpass=f=45,lowpass=f=2100' if rpm else 'highpass=f=180,lowpass=f=1800,equalizer=f=1050:t=q:w=0.8:g=-5'
 raw=subprocess.check_output(['ffmpeg','-v','error','-i',str(path),'-ss',str(start),'-t',str(end-start),'-ac','1','-ar',str(SR),'-af',filters,'-f','f32le','-'])
 x=np.frombuffer(raw,dtype='<f4').astype(float)
 if band:x=stabilize(x,band)
 # Overlap the tail with the head using complementary raised-cosine weights.
 # The loop boundary then joins adjacent original samples, not unrelated ends.
 n=min(int(SR*.12),len(x)//5); w=(1-np.cos(np.linspace(0,np.pi,n)))/2
 tail=x[-n:]*(1-w)+x[:n]*w
 x=np.concatenate([x[n:-n],tail]);x-=np.mean(x)
 x*=min(.16/np.sqrt(np.mean(x*x)),.78/max(abs(x)))
 path=ROOT/'assets/audio/loops'/f'{name}.wav'
 with wave.open(str(path),'wb') as f:f.setnchannels(1);f.setsampwidth(2);f.setframerate(SR);f.writeframes(np.round(x*32767).astype('<i2').tobytes())
 row={'id':name,'file':f'loops/{name}.wav','source':source,'segment':[start,end],'rpm':rpm,'seconds':round(len(x)/SR,5),'sha256':hashlib.sha256(path.read_bytes()).hexdigest()}
 manifest['loops'].append(row);print(name,row['seconds'])
(ROOT/'assets/audio/manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
