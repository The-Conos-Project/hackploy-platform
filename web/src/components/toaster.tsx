import { Toaster } from "sonner";

/** Sonner toaster styled to Conos / Hackploy tokens. */
export function AppToaster() {
  return (
    <Toaster
      position="top-right"
      theme="dark"
      closeButton
      richColors={false}
      toastOptions={{
        className: "hp-toast",
        classNames: {
          toast: "hp-toast",
          title: "hp-toast-title",
          description: "hp-toast-desc",
          closeButton: "hp-toast-close",
          error: "hp-toast-error",
          success: "hp-toast-success",
        },
      }}
    />
  );
}
