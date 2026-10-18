param([string]$Build)
$ErrorActionPreference='Stop'
Add-Type -AssemblyName PresentationFramework,PresentationCore,WindowsBase,System.Drawing
$outDir=Join-Path (Get-Location) 'docs/qa/reverse-call-world-story-20261018'
$setupPath=Join-Path $Build 'release/ReverseCall-Setup-0.1.8-x64.exe'
$assembly=[Reflection.Assembly]::LoadFrom($setupPath)
$type=$assembly.GetType('ReverseCall.Setup.Installer')
$flags=[Reflection.BindingFlags]'Instance,NonPublic'
$constructor=$type.GetConstructor($flags,$null,[type[]]@([string]),$null)
$installer=$constructor.Invoke([object[]]@('--preview'))
$window=$type.GetField('window',$flags).GetValue($installer)
$content=$window.Content
$content.Width=1040
$content.Height=660
$content.Measure([Windows.Size]::new(1040,660))
$content.Arrange([Windows.Rect]::new(0,0,1040,660))
$content.UpdateLayout()
$bitmap=[Windows.Media.Imaging.RenderTargetBitmap]::new(1040,660,96,96,[Windows.Media.PixelFormats]::Pbgra32)
$bitmap.Render($content)
$encoder=[Windows.Media.Imaging.PngBitmapEncoder]::new()
$encoder.Frames.Add([Windows.Media.Imaging.BitmapFrame]::Create($bitmap))
$stream=[IO.File]::Create((Join-Path $outDir 'windows-setup.png'))
$encoder.Save($stream)
$stream.Dispose()
foreach($name in @('icon.png','logo.png')) {
  $resource=$assembly.GetManifestResourceStream('ReverseCall.Setup.'+$name)
  $file=[IO.File]::Create((Join-Path $outDir ('installer-'+$name)))
  $resource.CopyTo($file)
  $file.Dispose()
  $resource.Dispose()
}
foreach($entry in @(@{Name='client-exe-icon';Path=(Join-Path $Build 'release/win-unpacked/ReverseCall.exe')},@{Name='setup-exe-icon';Path=$setupPath})) {
  $icon=[Drawing.Icon]::ExtractAssociatedIcon($entry.Path)
  $icon.ToBitmap().Save((Join-Path $outDir ($entry.Name+'.png')),[Drawing.Imaging.ImageFormat]::Png)
  $icon.Dispose()
}
Write-Output 'Installer resources and actual executable icons rendered without installation.'
