# Third-party notices

The core's Qimen seasonal/flying-board implementation was cross-checked and adapted using qimen-go, commit `4d3f58fa0f401b5b3a337f119138e99e90685dda` (https://github.com/deminzhang/qimen-go).
Taiyi modern calendar accumulation and cycles were cross-checked and adapted using kintaiyi, commit `11f78555d5e77c81ac8af69d243a981c22934733` (https://github.com/kentang2017/kintaiyi).
The Taiyi bureau tables use the public-domain classical SKQS edition rather than the differing modern implementation's table entries.

Both referenced projects use the following MIT permission. These notices accompany the published core package, including adapted implementation portions.

MIT License

Copyright (c) 2024 deminzhang

Copyright (c) 2023-2026 kentang2017

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

Other runtime dependencies are installed separately and retain their own bundled licenses, including astronomy-engine, circular-natal-horoscope-js, iztro, lunar-lite, liuren-ts-lib, lunar-javascript, pinyin, taobi, tyme4ts, and ajv.

The Ziwei adapter directly pins lunar-lite 0.2.7, also used by iztro 2.5.4, for consistent lunar dates and representative-hour stems/branches. It calls the library rather than maintaining a second ephemeris implementation.
