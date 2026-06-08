Add-Type -AssemblyName PresentationCore
Add-Type -AssemblyName WindowsBase

# Lucide Fish icon paths (viewBox 0 0 24 24, stroke-only)
$PATHS = @(
    "M6.5 12c.94-3.46 4.94-6 8.5-6 3.56 0 6.06 2.54 7 6-.94 3.47-3.44 6-7 6s-7.56-2.53-8.5-6Z",
    "M18 12v.5",
    "M16 17.93a9.77 9.77 0 0 1 0-11.86",
    "M7 10.67C7 8 5.58 5.97 2.73 5.5c-1 1.5-1 5 .23 6.5-1.24 1.5-1.24 5-.23 6.5C5.58 18.03 7 16 7 13.33",
    "M10.46 7.26C10.2 5.88 9.17 4.24 8 3h5.8a2 2 0 0 1 1.98 1.67l.23 1.4",
    "m16.01 17.93-.23 1.4A2 2 0 0 1 13.8 21H9.5a5.96 5.96 0 0 0 1.49-3.98"
)

function Make-Pen([byte]$a, [double]$w) {
    $brush = New-Object System.Windows.Media.SolidColorBrush(
        [System.Windows.Media.Color]::FromArgb($a, 0, 255, 65))
    $pen = New-Object System.Windows.Media.Pen($brush, $w)
    $pen.StartLineCap = [System.Windows.Media.PenLineCap]::Round
    $pen.EndLineCap   = [System.Windows.Media.PenLineCap]::Round
    $pen.LineJoin     = [System.Windows.Media.PenLineJoin]::Round
    return $pen
}

function New-FishBitmap([int]$Size) {
    $pad   = [Math]::Max(4.0, $Size * 0.09)
    $scale = ($Size - $pad * 2) / 24.0
    $pw    = [Math]::Max(1.5, $Size / 55.0)   # adaptive stroke width

    $dg = New-Object System.Windows.Media.DrawingGroup
    $dc = $dg.Open()

    # Black background
    $bgBrush = New-Object System.Windows.Media.SolidColorBrush(
        [System.Windows.Media.Color]::FromRgb(3, 3, 3))
    $dc.DrawRectangle($bgBrush, $null, [System.Windows.Rect]::new(0, 0, $Size, $Size))

    # Glow passes → neon CRT feel
    $glows = @(
        @{ a = 10; m = 5.0 },
        @{ a = 22; m = 3.0 },
        @{ a = 50; m = 1.8 }
    )

    foreach ($gl in $glows) {
        $pen = Make-Pen $gl.a ($pw * $gl.m)
        foreach ($pd in $PATHS) {
            $geo = ([System.Windows.Media.Geometry]::Parse($pd)).Clone()
            $tg  = New-Object System.Windows.Media.TransformGroup
            $tg.Children.Add((New-Object System.Windows.Media.ScaleTransform($scale, $scale)))
            $tg.Children.Add((New-Object System.Windows.Media.TranslateTransform($pad, $pad)))
            $geo.Transform = $tg
            $dc.DrawGeometry($null, $pen, $geo)
        }
    }

    # Main #00ff41 stroke
    $mainPen = Make-Pen 255 $pw
    foreach ($pd in $PATHS) {
        $geo = ([System.Windows.Media.Geometry]::Parse($pd)).Clone()
        $tg  = New-Object System.Windows.Media.TransformGroup
        $tg.Children.Add((New-Object System.Windows.Media.ScaleTransform($scale, $scale)))
        $tg.Children.Add((New-Object System.Windows.Media.TranslateTransform($pad, $pad)))
        $geo.Transform = $tg
        $dc.DrawGeometry($null, $mainPen, $geo)
    }

    $dc.Close()

    $rtb  = New-Object System.Windows.Media.Imaging.RenderTargetBitmap(
                $Size, $Size, 96, 96, [System.Windows.Media.PixelFormats]::Pbgra32)
    $dv   = New-Object System.Windows.Media.DrawingVisual
    $dvdc = $dv.RenderOpen()
    $dvdc.DrawDrawing($dg)
    $dvdc.Close()
    $rtb.Render($dv)
    return $rtb
}

function Get-PNGBytes($rtb) {
    $enc = New-Object System.Windows.Media.Imaging.PngBitmapEncoder
    $enc.Frames.Add([System.Windows.Media.Imaging.BitmapFrame]::Create($rtb))
    $ms = New-Object System.IO.MemoryStream
    $enc.Save($ms)
    return $ms.ToArray()
}

$dir = "src-tauri\icons"

$pngs = [ordered]@{
    'icon.png'              = 512
    '128x128.png'           = 128
    '128x128@2x.png'        = 256
    '32x32.png'             = 32
    'Square30x30Logo.png'   = 30
    'Square44x44Logo.png'   = 44
    'Square71x71Logo.png'   = 71
    'Square89x89Logo.png'   = 89
    'Square107x107Logo.png' = 107
    'Square142x142Logo.png' = 142
    'Square150x150Logo.png' = 150
    'Square284x284Logo.png' = 284
    'Square310x310Logo.png' = 310
    'StoreLogo.png'         = 50
}

foreach ($kv in $pngs.GetEnumerator()) {
    $png = Get-PNGBytes (New-FishBitmap -Size $kv.Value)
    [System.IO.File]::WriteAllBytes((Join-Path $dir $kv.Key), $png)
    Write-Host "  ok $($kv.Key)"
}

# ICO (16, 32, 48, 256)
$icoSizes  = @(16, 32, 48, 256)
$icoImages = @()
foreach ($s in $icoSizes) { $icoImages += ,(Get-PNGBytes (New-FishBitmap -Size $s)) }

$icoStream = New-Object System.IO.MemoryStream
$bw = New-Object System.IO.BinaryWriter($icoStream)
$bw.Write([System.Int16]0); $bw.Write([System.Int16]1); $bw.Write([System.Int16]$icoSizes.Count)
$offset = 6 + $icoSizes.Count * 16
for ($i = 0; $i -lt $icoSizes.Count; $i++) {
    $s = $icoSizes[$i]; $d = $icoImages[$i]
    $wb = if ($s -ge 256) { [byte]0 } else { [byte]$s }
    $bw.Write($wb); $bw.Write($wb); $bw.Write([byte]0); $bw.Write([byte]0)
    $bw.Write([System.Int16]1); $bw.Write([System.Int16]32)
    $bw.Write([System.Int32]$d.Length); $bw.Write([System.Int32]$offset)
    $offset += $d.Length
}
foreach ($d in $icoImages) { $bw.Write($d) }
$bw.Flush()
[System.IO.File]::WriteAllBytes((Join-Path $dir "icon.ico"), $icoStream.ToArray())
$bw.Dispose(); $icoStream.Dispose()
Write-Host "  ok icon.ico"

# ICNS
$icnsMap = @(
    @{ s=16;  t='icp4' }; @{ s=32;  t='icp5' }; @{ s=64;  t='icp6' }
    @{ s=128; t='ic07' }; @{ s=256; t='ic08' }; @{ s=512; t='ic09' }
)
$icnsStream = New-Object System.IO.MemoryStream
$iw = New-Object System.IO.BinaryWriter($icnsStream)
$iw.Write([System.Text.Encoding]::ASCII.GetBytes('icns'))
$iw.Write([byte[]]@(0,0,0,0))
foreach ($e in $icnsMap) {
    $png = Get-PNGBytes (New-FishBitmap -Size $e.s)
    $csz = 8 + $png.Length
    $iw.Write([System.Text.Encoding]::ASCII.GetBytes($e.t))
    $sb = [System.BitConverter]::GetBytes([System.Int32]$csz); [System.Array]::Reverse($sb)
    $iw.Write($sb); $iw.Write($png)
}
$iw.Flush()
$icnsData = $icnsStream.ToArray()
$tb = [System.BitConverter]::GetBytes([System.Int32]$icnsData.Length); [System.Array]::Reverse($tb)
for ($i = 0; $i -lt 4; $i++) { $icnsData[4+$i] = $tb[$i] }
[System.IO.File]::WriteAllBytes((Join-Path $dir "icon.icns"), $icnsData)
$iw.Dispose(); $icnsStream.Dispose()
Write-Host "  ok icon.icns"

Write-Host "Done."
