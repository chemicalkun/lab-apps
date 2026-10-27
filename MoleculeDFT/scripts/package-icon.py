"""Package PNG representations in the standard ICNS container."""
import struct
import sys
from pathlib import Path
root = Path(sys.argv[1])
reps = [('icp4',16,1),('icp5',32,1),('ic07',128,1),('ic08',256,1),('ic09',512,1),('ic11',16,2),('ic12',32,2),('ic13',128,2),('ic14',256,2),('ic10',512,2)]
chunks=[]
for kind,size,scale in reps:
    raw=(root/f'icon_{size}x{size}{"@2x" if scale==2 else ""}.png').read_bytes()
    chunks.append(kind.encode('ascii')+struct.pack('>I',len(raw)+8)+raw)
body=b''.join(chunks)
Path(sys.argv[2]).write_bytes(b'icns'+struct.pack('>I',len(body)+8)+body)
