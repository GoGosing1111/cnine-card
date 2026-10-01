$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
Add-Type -TypeDefinition @'
using System;
public static class HandPatch {
  public static readonly double[,] Outline = new double[,] {
    {38,887},{90,865},{149,846},{194,829},{214,816},{278,820},
    {290,850},{304,878},{338,910},{332,923},{300,918},{271,897},
    {237,902},{221,928},{217,1005},{223,1044},{204,1047},{182,1004},
    {168,958},{155,984},{151,1027},{132,1033},{126,1007},{106,1044},
    {99,1042},{105,1000},{91,1002},{78,997},{78,977},{115,917},
    {72,932},{38,934}
  };
  static bool Inside(double x,double y) {
    bool inside=false; int n=Outline.GetLength(0);
    for(int i=0,j=n-1;i<n;j=i++) {
      double xi=Outline[i,0],yi=Outline[i,1],xj=Outline[j,0],yj=Outline[j,1];
      if(((yi>y)!=(yj>y)) && x<(xj-xi)*(y-yi)/(yj-yi)+xi) inside=!inside;
    } return inside;
  }
  static double Distance(double x,double y) {
    double best=1e10; int n=Outline.GetLength(0);
    for(int i=0,j=n-1;i<n;j=i++) {
      double ax=Outline[j,0],ay=Outline[j,1],dx=Outline[i,0]-ax,dy=Outline[i,1]-ay;
      double t=Math.Max(0,Math.Min(1,((x-ax)*dx+(y-ay)*dy)/(dx*dx+dy*dy)));
      double ex=x-(ax+t*dx),ey=y-(ay+t*dy);
      best=Math.Min(best,Math.Sqrt(ex*ex+ey*ey));
    } return best;
  }
  public static byte[] Apply(byte[] source,byte[] hand,int stride,int width,int height) {
    byte[] output=(byte[])source.Clone();
    for(int y=810;y<1050;y++) for(int x=32;x<344;x++) {
      if(!Inside(x+0.5,y+0.5)) continue;
      double a=Math.Min(1,Distance(x+0.5,y+0.5)/4.0); a=a*a*(3-2*a);
      int p=y*stride+x*3;
      for(int c=0;c<3;c++) output[p+c]=(byte)Math.Round(source[p+c]*(1-a)+hand[p+c]*a);
    }
    return output;
  }
  public static long[] Compare(byte[] source,byte[] saved,int stride,int width,int height) {
    long changed=0,outside=0;
    for(int y=0;y<height;y++) for(int x=0;x<width;x++) {
      int p=y*stride+x*3;
      if(source[p]!=saved[p] || source[p+1]!=saved[p+1] || source[p+2]!=saved[p+2]) {
        changed++; if(!Inside(x+0.5,y+0.5)) outside++;
      }
    }
    return new long[] {changed,outside};
  }
}
'@
function Read-RgbImage([string]$imagePath) {
  $loaded = [System.Drawing.Bitmap]::new($imagePath)
  $rectangle = [System.Drawing.Rectangle]::new(0,0,$loaded.Width,$loaded.Height)
  $bitmap = $loaded.Clone($rectangle,[System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
  $loaded.Dispose()
  $data = $bitmap.LockBits($rectangle,[System.Drawing.Imaging.ImageLockMode]::ReadOnly,[System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
  $bytes = [byte[]]::new($data.Stride * $bitmap.Height)
  [System.Runtime.InteropServices.Marshal]::Copy($data.Scan0,$bytes,0,$bytes.Length)
  $stride = $data.Stride
  $bitmap.UnlockBits($data)
  return @{Bitmap=$bitmap;Bytes=$bytes;Stride=$stride;Rectangle=$rectangle}
}
$taskRoot = $PSScriptRoot
$inputPath = Join-Path $taskRoot 'sources/user-hand-fix-reference.png'
$patchPath = Join-Path $taskRoot 'assets/hand-mage-source-art-v3-five-digits.png'
$outputPath = Join-Path $taskRoot 'assets/hand-mage-source-art-v4-hand-only.png'
$source = Read-RgbImage $inputPath
$patch = Read-RgbImage $patchPath
if($source.Bitmap.Width -ne 1024 -or $source.Bitmap.Height -ne 1536 -or $patch.Stride -ne $source.Stride) { throw 'Unexpected input dimensions' }
$outputBytes = [HandPatch]::Apply($source.Bytes,$patch.Bytes,$source.Stride,1024,1536)
$writeData = $source.Bitmap.LockBits($source.Rectangle,[System.Drawing.Imaging.ImageLockMode]::WriteOnly,[System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
[System.Runtime.InteropServices.Marshal]::Copy($outputBytes,0,$writeData.Scan0,$outputBytes.Length)
$source.Bitmap.UnlockBits($writeData)
$source.Bitmap.Save($outputPath,[System.Drawing.Imaging.ImageFormat]::Png)
$saved = Read-RgbImage $outputPath
$counts = [HandPatch]::Compare($source.Bytes,$saved.Bytes,$source.Stride,1024,1536)
if($counts[1] -ne 0) { throw 'Outside-mask pixels changed' }
$detailRect = [System.Drawing.Rectangle]::new(30,770,340,290)
$detail = $saved.Bitmap.Clone($detailRect,[System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
$detail.Save((Join-Path $taskRoot 'qa/v4-hand-detail.png'),[System.Drawing.Imaging.ImageFormat]::Png)
$detail.Dispose()
$report = [ordered]@{
  source='sources/user-hand-fix-reference.png'
  correctedHand='assets/hand-mage-source-art-v3-five-digits.png'
  result='assets/hand-mage-source-art-v4-hand-only.png'
  generation='Built-in image_gen; hand from the existing five-digit correction'
  width=1024
  height=1536
  colorMode='RGB'
  changedPixels=$counts[0]
  changedPixelsOutsideHandMask=$counts[1]
  sha256=(Get-FileHash -Algorithm SHA256 -LiteralPath $outputPath).Hash
  status='USER_REVIEW_PENDING'
}
$report | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $taskRoot 'manifest-v4-hand-only.json') -Encoding utf8
$report | ConvertTo-Json
$source.Bitmap.Dispose()
$patch.Bitmap.Dispose()
$saved.Bitmap.Dispose()
