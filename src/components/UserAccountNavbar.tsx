import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { Button } from "./ui/button";
import { Icons } from "./Icons";
import Link from "next/link";
import { Gem, LogOut, Settings } from "lucide-react";
import { LogoutLink } from "@kinde-oss/kinde-auth-nextjs/server";
import { Avatar, AvatarFallback, AvatarImage } from "./ui/Avatar";
import { getUserSubscriptionPlan } from "@/lib/razorpay";

interface UserAccountNavProps {
  email: string | undefined;
  name: string;
  imageUrl: string;
}

const UserAccountNav = async ({
  email,
  imageUrl,
  name,
}: UserAccountNavProps) => {
  console.log(imageUrl);
  const subscriptionPlan = await getUserSubscriptionPlan();
  
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="relative h-8 w-8 rounded-full cursor-pointer">
          <Avatar className="h-8 w-8">
            {imageUrl && !imageUrl.endsWith("=blank&size=200") ? (
              <AvatarImage
                src={imageUrl}
                alt="profile picture"
                className="h-8 w-8 rounded-full"
              />
            ) : (
              <AvatarFallback className="h-8 w-8 flex items-center justify-center rounded-full bg-slate-200">
                <Icons.user className="h-4 w-4 text-slate-600" />
              </AvatarFallback>
            )}
          </Avatar>
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent className="w-56" align="end" forceMount>
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col space-y-1">
            {name && <p className="text-sm font-medium leading-none">{name}</p>}
            {email && (
              <p className="text-xs leading-none text-muted-foreground">
                {email}
              </p>
            )}
          </div>
        </DropdownMenuLabel>

        <DropdownMenuSeparator />

        <DropdownMenuItem asChild>
          <Link href="/dashboard" className="cursor-pointer">
            <Settings className="mr-2 h-4 w-4" />
            <span>Dashboard</span>
          </Link>
        </DropdownMenuItem>

        <DropdownMenuItem asChild>
          {subscriptionPlan?.isSubscribed ? (
            <Link href="/dashboard/billing" className="cursor-pointer">
              Manage Subscription
            </Link>
          ) : (
            <Link href="/pricing" className="cursor-pointer">
              Upgrade{" "}
              <Gem className="text-blue-600 h-4 w-4 ml-1.5" />
            </Link>
          )}
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        <DropdownMenuItem asChild>
          <LogoutLink className="cursor-pointer w-full">
            <LogOut className="mr-2 h-4 w-4" />
            <span>Log out</span>
          </LogoutLink>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default UserAccountNav;