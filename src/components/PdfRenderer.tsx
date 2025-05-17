"use client";

import { ChevronDown, ChevronUp, Loader2, RotateCw, Search } from "lucide-react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;
import { toast } from "sonner";
import { useResizeDetector } from "react-resize-detector";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { useState, useEffect } from "react";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { cn } from "@/lib/utils";
import SimpleBar from "simplebar-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import PdfFullScreen from "./PdfFullScreen";

interface PdfRendererProps {
  url: string;
}

const PdfRenderer = ({ url }: PdfRendererProps) => {
  const { width, ref } = useResizeDetector();
  const [numPages, setNumPages] = useState<number>();
  const [currPage, setCurrPage] = useState<number>(1);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [renderedScale, setRenderedScale] = useState<number | null>(null);
  
  // Important: PDF size constraint
  const [pdfOriginalWidth, setPdfOriginalWidth] = useState<number | null>(null);
  
  const customPageValidator = z.object({
    page: z
      .string()
      .refine((num) => Number(num) > 0 && Number(num) <= numPages!),
  });

  type TCustomPageValidator = z.infer<typeof customPageValidator>;
  
  const handlePageSubmit = ({ page }: TCustomPageValidator) => {
    setCurrPage(Number(page));
    setValue("page", String(page));
  };

  const {
    register,
    handleSubmit,
    formState: { errors },
    setValue,
  } = useForm<TCustomPageValidator>({
    defaultValues: {
      page: "1",
    },
    resolver: zodResolver(customPageValidator),
  });

  const [scale, setScale] = useState<number>(1);
  const [rotation, setRotation] = useState<number>(0);

  const zoomLevels = [
    { label: "100%", value: 1 },
    { label: "150%", value: 1.5 },
    { label: "200%", value: 2 },
    { label: "250%", value: 2.5 },
  ];
  
  // Use scale adjustment when window resizes
  useEffect(() => {
    if (pdfOriginalWidth && width) {
      // If PDF is wider than container, scale down
      if (pdfOriginalWidth > width) {
        const newScale = (width / pdfOriginalWidth) * scale;
        if (newScale !== scale) {
          setScale(newScale);
        }
      }
    }
  }, [width, pdfOriginalWidth]);

  return (
    <div className="w-full bg-white rounded-md shadow flex flex-col items-center">
      {/* Navigation bar - fixed height */}
      <div className="h-14 w-full border-b border-zinc-200 flex items-center justify-between px-2">
        <div className="flex items-center gap-1.5">
          <Button
            disabled={currPage === 1}
            onClick={() => {
              setCurrPage((prev) => Math.max(prev - 1, 1));
              setValue("page", String(currPage - 1));
            }}
            variant="ghost"
            aria-label="previous page"
            className="h-8 w-8 p-0"
          >
            <ChevronDown className="h-4 w-4" />
          </Button>
          <div className="flex items-center gap-1.5">
            <Input
              {...register("page")}
              className={cn(
                "w-12 h-8",
                errors.page && "focus-visible:ring-red-500"
              )}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  handleSubmit(handlePageSubmit)();
                }
              }}
            />
            <p className="text-zinc-700 text-sm space-x-1">
              <span> / </span>
              <span> {numPages ?? "x"} </span>
            </p>
          </div>
          <Button
            disabled={numPages === undefined || currPage == numPages}
            onClick={() => {
              setCurrPage((prev) => Math.min(prev + 1, numPages!));
              setValue("page", String(currPage + 1));
            }}
            variant="ghost"
            aria-label="next page"
            className="h-8 w-8 p-0"
          >
            <ChevronUp className="h-4 w-4" />
          </Button>
        </div>
        <div className="space-x-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                className="gap-1.5"
                variant="ghost"
                size="sm"
                aria-label="zoom"
              >
                <Search className="h-4 w-4" />
                <span>{Math.round(scale * 100)}%</span>
                <ChevronDown className="h-3 w-3 opacity-50" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              {zoomLevels.map((level) => (
                <DropdownMenuItem
                  key={level.label}
                  onSelect={() => setScale(level.value)}
                >
                  {level.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <Button
            onClick={() => setRotation((prev) => prev + 90)}
            variant="ghost"
            aria-label="rotate 90 degrees"
          >
            <RotateCw className="h-4 w-4" />
          </Button>
          <PdfFullScreen fileUrl={url}/>
        </div>
      </div>
      
      {/* PDF content area with proper scrolling */}
      <div className="flex-1 w-full max-h-screen">
        <SimpleBar
          autoHide={false}
          className="max-h-[calc(100vh-10rem)] overflow-x-auto">
          <div 
            ref={ref} 
            className="min-w-full"
            style={{
              display: 'flex',
              justifyContent: 'center',
            }}
          >
            <Document
              loading={
                <div className="flex justify-center">
                  <Loader2 className="my-24 h-6 w-6 animate-spin" />
                </div>
              }
              onLoadError={() => {
                toast.error("Something went wrong", {
                  description: "Please try again later!!",
                });
                setIsLoading(false);
              }}
              onLoadSuccess={({ numPages }) => {
                setNumPages(numPages);
                setIsLoading(false);
              }}
              file={url}
            >
              <div style={{ position: 'relative' }}>
                <Page
                  width={width ? width : 1}
                  pageNumber={currPage}
                  scale={scale}
                  rotate={rotation}
                  key={'@' + scale}
                  loading={
                    <div className='flex justify-center'>
                      <Loader2 className='my-24 h-6 w-6 animate-spin' />
                    </div>
                  }
                  onRenderSuccess={(page) => {
                    // Store original width for scaling calculations
                    if (!pdfOriginalWidth) {
                      setPdfOriginalWidth(page.width);
                    }
                    setRenderedScale(scale);
                  }}
                />
              </div>
            </Document>
          </div>
        </SimpleBar>
        
        {/* Full-page loading overlay */}
        {isLoading && (
          <div className="absolute inset-0 bg-white bg-opacity-70 flex items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-gray-500" />
          </div>
        )}
      </div>
    </div>
  );
};

export default PdfRenderer;