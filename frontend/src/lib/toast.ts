import { toast as baseToast } from 'sonner';

const schedule = <Fn extends (...args: unknown[]) => unknown>(fn: Fn): Fn => {
  return ((...args: Parameters<Fn>) => {
    setTimeout(() => {
      fn(...args);
    }, 0);
    return undefined as ReturnType<Fn>;
  }) as Fn;
};

const wrappedToast = schedule(baseToast) as typeof baseToast;

wrappedToast.success = schedule(baseToast.success);
wrappedToast.info = schedule(baseToast.info);
wrappedToast.warning = schedule(baseToast.warning);
wrappedToast.error = schedule(baseToast.error);
wrappedToast.message = schedule(baseToast.message);
wrappedToast.custom = schedule(baseToast.custom);
wrappedToast.loading = schedule(baseToast.loading);
wrappedToast.promise = baseToast.promise.bind(baseToast);
wrappedToast.dismiss = baseToast.dismiss.bind(baseToast);
wrappedToast.getHistory = baseToast.getHistory.bind(baseToast);
wrappedToast.getToasts = baseToast.getToasts.bind(baseToast);

export const toast = wrappedToast;
