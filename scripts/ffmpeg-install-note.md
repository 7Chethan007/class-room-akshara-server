Install FFmpeg (Windows quick steps)
------------------------------------
1) Download static build: https://www.gyan.dev/ffmpeg/builds/ffmpeg-git-full.7z
2) Extract to e.g. `C:\ffmpeg`
3) Add `C:\ffmpeg\bin` to PATH:
   - Win+R → sysdm.cpl → Advanced → Environment Variables → PATH → Edit → New → `C:\ffmpeg\bin`
4) Restart terminal; verify with `ffmpeg -version`
