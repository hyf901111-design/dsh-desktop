# Third-party notices

## Bklit UI chart components

This isolated visual preview vendors the MIT-licensed chart source from [bklit/bklit-ui](https://github.com/bklit/bklit-ui), specifically `packages/ui/src`. No Bklit Studio source is included.

- Official installation: https://bklit.com/docs/installation
- Official registry namespace: `@bklit` at `https://ui.bklit.com/r/{name}.json`
- Source commit: `c57f66bfa7c3198edb677b567ce08cbf364ae159`
- Upstream package: `@bklitui/ui`, version `0.0.0` (private source package; commit SHA is the meaningful version pin).
- Local location: `src/vendor/bklit`.
- Modifications: import aliases normalized to relative paths; `AreaChart` uses React `useId()` to make its SVG reveal clip unique per instance, preventing duplicate clipping IDs in side-by-side previews; `index.ts` is a local export adapter.
- Per-file source URLs and original/local SHA-256 hashes: `src/vendor/bklit/SOURCE_MANIFEST.json`.

MIT License

Copyright (c) 2026 uixmat

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
