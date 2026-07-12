'use client';

import { Toaster as Sonner } from "sonner";

export function Toaster(props: any) {
  return (
    <Sonner
      theme="light"
      className="toaster group"
      position="top-right"
      offset="75px"
      expand={true}
      closeButton={false}
      duration={3000}
      visibleToasts={5}
      {...props}
    />
  );
}
