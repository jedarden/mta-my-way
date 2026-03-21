import type { ReactNode } from "react";
import BottomNav from "./BottomNav";
import Header from "./Header";

interface ScreenProps {
  children: ReactNode;
}

export default function Screen({ children }: ScreenProps) {
  return (
    <div className="flex flex-col h-full bg-background dark:bg-dark-background">
      <Header />
      <main className="flex-1 overflow-y-auto pb-14" role="main">
        {children}
      </main>
      <BottomNav />
    </div>
  );
}
