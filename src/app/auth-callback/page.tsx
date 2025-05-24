"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { trpc } from "../_trpc/client";
import { useEffect, Suspense } from "react";
import { Loader2 } from "lucide-react";

const AuthCallbackContent = () => {
    const router = useRouter();
    const searchParams = useSearchParams();
    const origin = searchParams.get('origin');

    const { data, error } = trpc.authCallback.useQuery(undefined, {
        retry: true,
        retryDelay: 500,
    });

    useEffect(() => {
        if (data?.success) {
            // User is synced to db, redirecting
            router.push(origin ? `/${origin}` : '/dashboard');
        } else if (error) {
            // Unauthorized user, redirect to sign-in
            router.push('/sign-in');
        }
    }, [data, error, origin, router]);

    return (
        <div className='w-full mt-24 flex justify-center'>
          <div className='flex flex-col items-center gap-2'>
            <Loader2 className='h-8 w-8 animate-spin text-zinc-800' />
            <h3 className='font-semibold text-xl'>
              Setting up your account...
            </h3>
            <p>You will be redirected automatically.</p>
          </div>
        </div>
    );
};

const Page = () => {
    return (
        <Suspense fallback={
            <div className='w-full mt-24 flex justify-center'>
              <div className='flex flex-col items-center gap-2'>
                <Loader2 className='h-8 w-8 animate-spin text-zinc-800' />
                <h3 className='font-semibold text-xl'>
                  Loading...
                </h3>
              </div>
            </div>
        }>
            <AuthCallbackContent />
        </Suspense>
    );
};

export default Page;