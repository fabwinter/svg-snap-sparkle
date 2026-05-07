import { useCallback, useEffect, useRef, useState } from 'react';
import ImageImport from '@/components/ImageImport';
import SettingsPanel from '@/components/SettingsPanel';
import ProcessingState from '@/components/ProcessingState';
import PreviewCanvas from '@/components/PreviewCanvas';
import ActionBar from '@/components/ActionBar';
import { WorkerClient } from '@/services/worker-client';
import { PresetType, PRESETS, buildTraceConfig, buildMaskConfig, getDefaultAdvanced } from '@/types/preset';
import { DEFAULT_CLEANUP } from '@/types/pipeline';
import { Sparkles } from 'lucide-react';
import type { AdvancedSettings } from '@/components/SettingsPanel';
import { detectPaletteHex, hexToRgb } from '@/utils/palette-detect';

type AppStep = 'import' | 'settings' | 'processing' | 'preview';

export default function App() {
  const workerClient = useRef(new WorkerClient());

  const [step, setStep] = useState<AppStep>('import');
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [imageData, setImageData] = useState<ImageData | null>(null);
  const [preset, setPreset] = useState<PresetType>('logo');
  const [colorCount, setColorCount] = useState(2);
  const [removeBg, setRemoveBg] = useState(true);
  const [cutout, setCutout] = useState(false);
  const [advanced, setAdvanced] = useState<AdvancedSettings>(() => getDefaultAdvanced('logo'));
  const [svgString, setSvgString] = useState<string | null>(null);
  const [svgWidth, setSvgWidth] = useState(0);
  const [svgHeight, setSvgHeight] = useState(0);
  const [progressStage, setProgressStage] = useState('');
  const [progressPercent, setProgressPercent] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [palette, setPalette] = useState<string[]>([]);
  const [paletteEdited, setPaletteEdited] = useState(false);

  // Auto-detect palette whenever the image or requested colour count changes,
  // unless the user has manually edited the palette.
  useEffect(() => {
    if (!imageData) { setPalette([]); setPaletteEdited(false); return; }
    if (paletteEdited) return;
    const hexes = detectPaletteHex(imageData, colorCount);
    setPalette(hexes);
  }, [imageData, colorCount, paletteEdited]);

  const handleImageLoaded = useCallback((file: File, data: ImageData) => {
    setSourceFile(file);
    setImageData(data);
    setPaletteEdited(false);
    setStep('settings');
  }, []);

  const handlePresetChange = useCallback((p: PresetType) => {
    setPreset(p);
    setColorCount(PRESETS[p].colorCount);
    setRemoveBg(PRESETS[p].removeBg);
    setAdvanced(getDefaultAdvanced(p));
    setPaletteEdited(false);
  }, []);

  const handleColorCountChange = useCallback((n: number) => {
    setColorCount(n);
    setPaletteEdited(false); // re-detect palette to match new count
  }, []);

  const handlePaletteChange = useCallback((next: string[]) => {
    setPalette(next);
    setPaletteEdited(true);
  }, []);

  const handleConvert = useCallback(async () => {
    if (!imageData) return;
    setStep('processing');
    setError(null);
    setProgressStage('Analysing...');
    setProgressPercent(0);

    try {
      const activePalette = palette
        .slice(0, colorCount)
        .filter((hex) => /^#[0-9a-fA-F]{6}$/.test(hex));
      const traceConfig = buildTraceConfig(preset, colorCount, advanced);
      if (activePalette.length > 0) {
        traceConfig.palette = activePalette.map(hexToRgb);
        traceConfig.colorPrecision = activePalette.length;
      }
      traceConfig.cutout = cutout;
      const maskConfig = buildMaskConfig(removeBg, advanced.bgTolerance);
      const result = await workerClient.current.process(
        imageData, maskConfig, DEFAULT_CLEANUP, traceConfig,
        { onProgress: (stage, percent) => { setProgressStage(stage); setProgressPercent(percent); } }
      );
      setSvgString(result.svgString);
      setSvgWidth(result.width);
      setSvgHeight(result.height);
      setStep('preview');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    }
  }, [imageData, preset, colorCount, removeBg, advanced, palette, cutout]);

  const handleRerun = useCallback(() => {
    setSvgString(null);
    setStep('settings');
  }, []);

  const handleReset = useCallback(() => {
    setSourceFile(null);
    setImageData(null);
    setSvgString(null);
    setPalette([]);
    setPaletteEdited(false);
    setStep('import');
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-[720px] mx-auto px-4 py-6">
        {/* Header */}
        <header className="text-center space-y-1 pb-4">
          <h1 className="text-lg font-bold text-foreground flex items-center justify-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            SVGmagic Lite
          </h1>
          <p className="text-xs text-muted-foreground">
            Convert raster images to clean SVG vectors
          </p>
        </header>

        {/* Sticky canvas slot — locked while panel below scrolls */}
        <div className="sticky top-0 z-20 bg-background pt-2 pb-4 -mx-4 px-4">
          {step === 'preview' && svgString && sourceFile ? (
            <PreviewCanvas
              originalFile={sourceFile}
              svgString={svgString}
              svgWidth={svgWidth}
              svgHeight={svgHeight}
            />
          ) : (
            <ImageImport
              onImageLoaded={handleImageLoaded}
              sourceFile={sourceFile}
              imageData={imageData}
              onReset={handleReset}
            />
          )}
          {/* Import-different-image button just below canvas (preview step) */}
          {step === 'preview' && sourceFile && (
            <button
              onClick={handleReset}
              className="mt-3 w-full text-center text-xs text-muted-foreground hover:text-foreground transition-colors py-2"
            >
              Import different image
            </button>
          )}
        </div>

        <div className="space-y-6 pt-2">
          {(step === 'settings' || step === 'processing' || step === 'preview') && (
            <SettingsPanel
              preset={preset}
              colorCount={colorCount}
              removeBg={removeBg}
              cutout={cutout}
              hasImage={!!imageData}
              advanced={advanced}
              palette={palette}
              onPresetChange={handlePresetChange}
              onColorCountChange={handleColorCountChange}
              onRemoveBgChange={setRemoveBg}
              onCutoutChange={setCutout}
              onAdvancedChange={setAdvanced}
              onPaletteChange={handlePaletteChange}
              onConvert={handleConvert}
            />
          )}

          {step === 'processing' && (
            <ProcessingState
              stage={progressStage}
              percent={progressPercent}
              error={error}
              onRetry={handleConvert}
            />
          )}

          {step === 'preview' && svgString && sourceFile && (
            <ActionBar
              svgString={svgString}
              originalFilename={sourceFile.name}
              onRerun={handleRerun}
            />
          )}
        </div>
      </div>
    </div>
  );
}
