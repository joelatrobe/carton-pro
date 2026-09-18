#!/usr/bin/env python3
"""Add sample 1 to an MP4's sync-sample table if it is missing.

VLC's muxer leaves the first frame out of stss. Playback from the top never
notices, but every seek to zero snaps to the next listed keyframe instead, so
a looping clip shows a frozen frame at the start of each loop. The first
frame is always an IDR from x264, so the table is simply wrong.

Usage: fix-stss.py IN.mp4 OUT.mp4
Grows stss by 4 bytes, the ancestor atoms with it, and shifts every stco/co64
entry by 4 because moov precedes mdat in a faststart file.
"""
import struct, sys

CONTAINERS = ('moov', 'trak', 'mdia', 'minf', 'stbl', 'edts')

def atoms(buf, start, end):
    p = start; out = []
    while p + 8 <= end:
        size, typ = struct.unpack('>I4s', buf[p:p+8]); typ = typ.decode('latin-1'); hdr = 8
        if size == 1: size = struct.unpack('>Q', buf[p+8:p+16])[0]; hdr = 16
        elif size == 0: size = end - p
        if size < hdr: break
        out.append((typ, p, size, p + hdr)); p += size
    return out

def find_all(buf, start, end, want, path=()):
    res = []
    for typ, pos, size, body in atoms(buf, start, end):
        if typ in want: res.append((typ, pos, size, body, path))
        if typ in CONTAINERS: res += find_all(buf, body, pos + size, want, path + ((typ, pos),))
    return res

def fix(src, dst):
    buf = bytearray(open(src, 'rb').read())
    top = atoms(buf, 0, len(buf))
    moov = [p for t, p, _, _ in top if t == 'moov'][0]
    mdat = [p for t, p, _, _ in top if t == 'mdat'][0]
    assert moov < mdat, 'expected faststart layout (moov before mdat)'
    hits = find_all(buf, 0, len(buf), ('stss', 'hdlr'))
    vtrak = next(dict(p)['trak'] for t, _, _, b, p in hits if t == 'hdlr' and buf[b+8:b+12] == b'vide')
    pos, size, body, path = next((p_, s_, b_, pa) for t, p_, s_, b_, pa in hits if t == 'stss' and dict(pa)['trak'] == vtrak)
    n = struct.unpack('>I', buf[body+4:body+8])[0]
    entries = list(struct.unpack('>%dI' % n, buf[body+8:body+8+4*n]))
    if entries and entries[0] == 1:
        print('%s: sample 1 already a sync sample, nothing to do' % src); return
    new = [1] + entries
    stss = struct.pack('>I4s', 16 + 4*len(new), b'stss') + buf[body:body+4] + struct.pack('>I', len(new)) + struct.pack('>%dI' % len(new), *new)
    delta = len(stss) - size
    for _, apos in path:
        buf[apos:apos+4] = struct.pack('>I', struct.unpack('>I', buf[apos:apos+4])[0] + delta)
    for typ, _, _, cbody, _ in find_all(buf, 0, len(buf), ('stco', 'co64')):
        cnt = struct.unpack('>I', buf[cbody+4:cbody+8])[0]
        fmt, w = ('>%dI' % cnt, 4) if typ == 'stco' else ('>%dQ' % cnt, 8)
        vals = struct.unpack(fmt, buf[cbody+8:cbody+8+w*cnt])
        buf[cbody+8:cbody+8+w*cnt] = struct.pack(fmt, *[v + delta for v in vals])
    open(dst, 'wb').write(bytes(buf[:pos]) + stss + bytes(buf[pos+size:]))
    print('%s -> %s: sync samples %d -> %d, first now %s' % (src, dst, n, len(new), new[:3]))

if __name__ == '__main__':
    fix(sys.argv[1], sys.argv[2])
