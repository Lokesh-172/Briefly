import { trpc } from "@/app/_trpc/client";
import { INFINITE_QUERY_LIMT } from "@/config/infinite-query";
import { Loader2, MessageSquare } from "lucide-react";
import Skeleton from "react-loading-skeleton";
import Message from "./Message";
import { useContext, useEffect, useRef } from "react";
import { ChatContext } from "./ChatContext";
import { useIntersection } from "@mantine/hooks";
import { keepPreviousData } from "@tanstack/react-query";

interface MessagesProps {
  fileId: string;
}

const Messages = ({ fileId }: MessagesProps) => {
  const { isLoading: isAiThinking } = useContext(ChatContext);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Add hasNextPage and isFetchingNextPage to prevent unnecessary calls
  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } =
    trpc.getFileMessages.useInfiniteQuery(
      {
        fileId,
        limit: INFINITE_QUERY_LIMT,
      },
      {
        getNextPageParam: (lastPage) => lastPage?.nextCursor,
        placeholderData: keepPreviousData,
      },
    );

  const messages = data?.pages.flatMap((page) => page.messages);

  const loadingMessage = {
    createdAt: new Date().toISOString(),
    id: "loading-message",
    isUserMessage: false,
    text: (
      <span className="flex h-full items-center justify-center">
        <Loader2 className="h-4 w-4 animate-spin" />
      </span>
    ),
  };

  const combinedMessages = [
    ...(isAiThinking ? [loadingMessage] : []),
    ...(messages || []),
  ];

  // Remove unused lastMessageRef and set root to null (viewport)
  const { ref, entry } = useIntersection({
    root: null, // Use viewport as root
    threshold: 0.1, // Trigger when 10% of the element is visible
  });

  useEffect(() => {
    // Add proper conditions to prevent unnecessary API calls
    if (entry?.isIntersecting && hasNextPage && !isFetchingNextPage) {
      console.log("Fetching next page..."); // Debug log
      fetchNextPage();
    }
  }, [entry, fetchNextPage, hasNextPage, isFetchingNextPage]);

  // Auto-scroll to bottom when new messages arrive or AI is thinking
  useEffect(() => {
    if (bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [combinedMessages, isAiThinking]);

  return (
    <div className="flex max-h-[calc(100vh-3.5rem-7rem)] border-zinc-200 flex-1 flex-col-reverse gap-4 p-3 overflow-y-auto scrollbar-thumb-blue scrollbar-thumb-rounded scrollbar-track-blue-lighter scrollbar-w-2 scrolling-touch">
      {combinedMessages && combinedMessages.length > 0 ? (
        <>
          <div ref={bottomRef} />
          {combinedMessages.map((message, i) => {
            const isNextMessageSamePerson =
              combinedMessages[i - 1]?.isUserMessage ===
              combinedMessages[i].isUserMessage;
            return (
              <Message
                key={message.id}
                isNextMessageSamePerson={isNextMessageSamePerson}
                message={message}
              />
            );
          })}

          {/* Trigger element for infinite scroll - placed at the end (top due to flex-col-reverse) */}
          {hasNextPage && (
            <div
              ref={ref}
              className="h-1 w-full"
              style={{ background: "transparent" }}
            />
          )}
        </>
      ) : isLoading ? (
        <div className="w-full flex flex-col gap-2">
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
        </div>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center gap-2">
          <MessageSquare className="h-8 w-8 text-blue-500" />
          <h3 className="font-semibold text-xl">You&apos;re all set!</h3>
          <p className="text-zinc-500 text-sm">
            Ask your first question to get started.
          </p>
        </div>
      )}

      {/* Optional: Show loading indicator when fetching next page */}
      {isFetchingNextPage && (
        <div className="flex justify-center py-2">
          <Loader2 className="h-4 w-4 animate-spin" />
        </div>
      )}
    </div>
  );
};

export default Messages;
