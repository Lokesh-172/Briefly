'use client'

import {
  ChevronDown,
  ChevronUp,
  Loader2,
  RotateCw,
  Search,
} from 'lucide-react'
import { Document, Page, pdfjs } from 'react-pdf'

import 'react-pdf/dist/Page/AnnotationLayer.css'
import 'react-pdf/dist/Page/TextLayer.css'

import { useResizeDetector } from 'react-resize-detector'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { useState, useEffect, useRef, useCallback, useMemo } from 'react'

import { useForm } from 'react-hook-form'
import { z } from 'zod'

import { zodResolver } from '@hookform/resolvers/zod'
import { cn } from '@/lib/utils'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from './ui/dropdown-menu'

import SimpleBar from 'simplebar-react'
import PdfFullscreen from './PdfFullScreen'
import { toast } from 'sonner'

// Configure PDF.js worker
pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`

interface PdfRendererProps {
  url: string
}

const PdfRenderer = ({ url }: PdfRendererProps) => {
  const { width, ref } = useResizeDetector()
  const renderTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const abortControllerRef = useRef<AbortController | null>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const documentRef = useRef<any>(null)  
  const scrollContainerRef = useRef<HTMLDivElement | null>(null)

  const [numPages, setNumPages] = useState<number>()
  const [currPage, setCurrPage] = useState<number>(1)
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [renderedScale, setRenderedScale] = useState<number | null>(null)
  const [scale, setScale] = useState<number>(1)
  const [rotation, setRotation] = useState<number>(0)
  const [pdfOriginalWidth, setPdfOriginalWidth] = useState<number | null>(null)
  const [initialScaleSet, setInitialScaleSet] = useState<boolean>(false)

  // Create a new abort controller when the component mounts
  useEffect(() => {
    abortControllerRef.current = new AbortController();
    
    return () => {
      // Clean up on unmount
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
    };
  }, []);

  const customPageValidator = z.object({
    page: z
      .string()
      .refine(
        (num) => Number(num) > 0 && Number(num) <= numPages!
      ),
  })

  type TCustomPageValidator = z.infer<typeof customPageValidator>

  const {
    register,
    handleSubmit,
    formState: { errors },
    setValue,
  } = useForm<TCustomPageValidator>({
    defaultValues: {
      page: '1',
    },
    resolver: zodResolver(customPageValidator),
  })

  // Debounced page change with abort handling
  const debouncedPageChange = useCallback((newPage: number) => {
    // Abort any ongoing rendering before changing page
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = new AbortController();
    }

    if (renderTimeoutRef.current) {
      clearTimeout(renderTimeoutRef.current)
    }
    
    renderTimeoutRef.current = setTimeout(() => {
      setCurrPage(newPage)
      setValue('page', String(newPage))
    }, 150)
  }, [setValue])

  const handlePageSubmit = ({ page }: TCustomPageValidator) => {
    debouncedPageChange(Number(page))
  }

  const handlePrevPage = () => {
    if (currPage > 1) {
      debouncedPageChange(currPage - 1)
    }
  }

  const handleNextPage = () => {
    if (numPages && currPage < numPages) {
      debouncedPageChange(currPage + 1)
    }
  }

  const zoomLevels = [
    { label: "100%", value: 1 },
    { label: "150%", value: 1.5 },
    { label: "200%", value: 2 },
    { label: "250%", value: 2.5 },
  ]

  // Enhanced PDF options with better error handling
  const pdfOptions = useMemo(() => ({
    cMapUrl: `//unpkg.com/pdfjs-dist@${pdfjs.version}/cmaps/`,
    cMapPacked: true,
    standardFontDataUrl: `//unpkg.com/pdfjs-dist@${pdfjs.version}/standard_fonts/`,
  }), [])
  
  // Cleanup function with improved abort logic
  useEffect(() => {
    return () => {
      if (renderTimeoutRef.current) {
        clearTimeout(renderTimeoutRef.current)
      }
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }
      
      // Try to clean up any PDF.js resources
      if (documentRef.current?.viewer) {
        documentRef.current.viewer.cleanup();
      }
    }
  }, [])

  // Reset scroll position on scale change
  useEffect(() => {
    if (scale !== renderedScale && scrollContainerRef.current) {
      // Reset scroll position when scale changes
      // This ensures smooth experience when zooming
      scrollContainerRef.current.scrollLeft = 0;
    }
  }, [scale, renderedScale]);

  // Handle scale changes with debouncing and better scroll handling
  const handleScaleChange = useCallback((newScale: number) => {
    if (renderTimeoutRef.current) {
      clearTimeout(renderTimeoutRef.current)
    }
    
    renderTimeoutRef.current = setTimeout(() => {
      setScale(newScale)
    }, 100)
  }, [])

  // Optional: Set initial scale to fit width on first load only
  useEffect(() => {
    if (!initialScaleSet && pdfOriginalWidth && width && !isLoading) {
      if (pdfOriginalWidth > width) {
        const initialScale = width / pdfOriginalWidth;
        setScale(initialScale);
      }
      setInitialScaleSet(true);
    }
  }, [pdfOriginalWidth, width, isLoading, initialScaleSet]);

  // Enhanced error handler with better warning filtering
  const handleRenderError = useCallback((error: Error) => {
    // Filter out AbortException warnings - these are expected during navigation/refresh
    if (error.message.includes('AbortException') || 
        error.message.includes('cancelled') || 
        error.message.includes('TextLayer task cancelled')) {
      // These are normal during navigation or refresh, so just log them quietly
      console.debug('PDF render cancelled:', error.message);
      return;
    }
    
    // Only show toast for actual rendering errors
    console.warn('PDF render error:', error.message);
    toast.error("Rendering error", {
      description: 'Some PDF features may not work properly',
    });
  }, []);

  return (
    <div className='w-full bg-white rounded-md shadow flex flex-col items-center relative'>
      {/* Loader - completely separate from the PDF components */}
      {isLoading && (
        <div className='absolute inset-0 z-50 bg-white bg-opacity-70 flex items-center justify-center'>
          <Loader2 className='h-10 w-10 animate-spin text-gray-500' />
        </div>
      )}

      {/* Navigation bar - fixed height */}
      <div className='h-14 w-full border-b border-zinc-200 flex items-center justify-between px-2'>
        <div className='flex items-center gap-1.5'>
          <Button
            disabled={currPage === 1}
            onClick={handlePrevPage}
            variant='ghost'
            aria-label='previous page'
            className='h-8 w-8 p-0'>
            <ChevronDown className='h-4 w-4' />
          </Button>

          <div className='flex items-center gap-1.5'>
            <Input
              {...register('page')}
              className={cn(
                'w-12 h-8',
                errors.page && 'focus-visible:ring-red-500'
              )}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleSubmit(handlePageSubmit)()
                }
              }}
            />
            <p className='text-zinc-700 text-sm space-x-1'>
              <span> / </span>
              <span> {numPages ?? 'x'} </span>
            </p>
          </div>

          <Button
            disabled={numPages === undefined || currPage === numPages}
            onClick={handleNextPage}
            variant='ghost'
            aria-label='next page'
            className='h-8 w-8 p-0'>
            <ChevronUp className='h-4 w-4' />
          </Button>
        </div>

        <div className='space-x-2'>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                className='gap-1.5'
                variant='ghost'
                size='sm'
                aria-label='zoom'>
                <Search className='h-4 w-4' />
                <span>{Math.round(scale * 100)}%</span>
                <ChevronDown className='h-3 w-3 opacity-50' />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              {zoomLevels.map((level) => (
                <DropdownMenuItem
                  key={level.label}
                  onSelect={() => handleScaleChange(level.value)}>
                  {level.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <Button
            onClick={() => setRotation((prev) => prev + 90)}
            variant='ghost'
            aria-label='rotate 90 degrees'>
            <RotateCw className='h-4 w-4' />
          </Button>

          <PdfFullscreen fileUrl={url} />
        </div>
      </div>

      {/* PDF content area with proper scrolling */}
      <div className='flex-1 w-full max-h-screen'>
        <SimpleBar
          autoHide={false}
          className='max-h-[calc(100vh-10rem)] overflow-x-auto'
          scrollableNodeProps={{ ref: scrollContainerRef }}>
          <div 
            ref={ref} 
            className='min-w-fit'
            style={{
              display: 'flex',
              justifyContent: 'flex-start', // Keep flex-start for proper scrolling
              padding: '1rem',
              minWidth: '100%', // Ensures container is at least 100% wide
              minHeight: '100%',
            }}>
            <Document
              ref={documentRef}
              onLoadError={(error: Error) => {
                console.error('PDF load error:', error)
                toast.error("Failed to load PDF", {
                  description: 'Please check the file and try again',
                })
                setIsLoading(false)
              }}
              onLoadSuccess={({ numPages }) => {
                setNumPages(numPages)
                setIsLoading(false)
              }}
              file={url}
              options={pdfOptions}>
              <div style={{ 
                position: 'relative',
                display: 'inline-block', // Important for proper sizing and scroll behavior
              }}>
                <Page
                  width={width ? width : 1}
                  pageNumber={currPage}
                  scale={scale}
                  rotate={rotation}
                  key={`page-${currPage}-${scale}-${rotation}`}
                  onRenderSuccess={(page) => {
                    if (!pdfOriginalWidth) {
                      setPdfOriginalWidth(page.width)
                    }
                    setRenderedScale(scale)
                  }}
                  onRenderError={handleRenderError}
                  renderTextLayer={true}
                  renderAnnotationLayer={true}
                />
              </div>
            </Document>
          </div>
        </SimpleBar>
      </div>
    </div>
  )
}

export default PdfRenderer