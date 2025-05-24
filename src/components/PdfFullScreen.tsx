import { useState, useRef, useEffect } from "react";
import { Button } from "./ui/button";
import { Expand, Loader2, Minimize } from "lucide-react";
import SimpleBar from "simplebar-react";
import { Document, Page } from "react-pdf";
import { useResizeDetector } from "react-resize-detector";
import { toast } from "sonner";

interface PdfFullscreenProps {
  fileUrl: string;
}

const PdfFullscreen = ({ fileUrl }: PdfFullscreenProps) => {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [numPages, setNumPages] = useState<number>();
  const [showContent, setShowContent] = useState(false);

  const fullscreenRef = useRef<HTMLDivElement>(null);
  const { width, ref } = useResizeDetector();

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);

      if (!document.fullscreenElement) {
        setShowContent(false);
      }
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
    };
  }, []);

  const handleFullscreen = async () => {
    setShowContent(true);

    setTimeout(async () => {
      try {
        if (fullscreenRef.current) {
          await fullscreenRef.current.requestFullscreen();
          setIsFullscreen(true);
        }
      } catch (error: unknown) {
        const message =
          error instanceof Error ? error.message : "An unknown error occurred";

        toast.error("Error entering fullscreen", {
          description: message,
        });

        setShowContent(false);
      }
    }, 100);
  };

  return (
    <>
      {!showContent && (
        <Button
          variant="ghost"
          className="gap-1.5"
          onClick={handleFullscreen}
          aria-label="fullscreen"
        >
          <Expand className="h-4 w-4" />
        </Button>
      )}

      {showContent && (
        <div
          ref={fullscreenRef}
          className={`
            fixed inset-0 bg-white z-50
            ${!isFullscreen ? "rounded-lg shadow-lg" : ""}
          `}
        >
          <div className="flex justify-end p-2">
            <Button
              variant="ghost"
              className="gap-1.5"
              onClick={() => document.exitFullscreen()}
              aria-label="exit fullscreen"
            >
              <Minimize className="h-4 w-4" />
            </Button>
          </div>

          <SimpleBar autoHide={false} className="h-[calc(100%-3rem)] w-full">
            <div ref={ref} className="w-full">
              <Document
                loading={
                  <div className="flex justify-center">
                    <Loader2 className="my-24 h-6 w-6 animate-spin" />
                  </div>
                }
                onLoadError={() => {
                  toast.error("Something went wrong", {
                    description: "Please try again later",
                  });
                }}
                onLoadSuccess={({ numPages }) => setNumPages(numPages)}
                file={fileUrl}
                className="max-h-full w-full"
              >
                {numPages &&
                  new Array(numPages)
                    .fill(0)
                    .map((_, i) => (
                      <Page
                        key={i}
                        width={width ? width : 1}
                        pageNumber={i + 1}
                      />
                    ))}
              </Document>
            </div>
          </SimpleBar>
        </div>
      )}
    </>
  );
};

export default PdfFullscreen;
