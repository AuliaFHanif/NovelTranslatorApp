import Swal from "sweetalert2";

export function showSuccess(title: string, message?: string) {
  return Swal.fire({
    icon: "success",
    title,
    text: message,
    confirmButtonColor: "#8b2626",
    confirmButtonText: "OK",
    allowOutsideClick: false,
    didOpen: () => {
      document.body.style.pointerEvents = "auto";
      const swalContainer = document.querySelector(
        ".swal2-container",
      ) as HTMLElement;
      if (swalContainer) {
        swalContainer.style.pointerEvents = "auto";
        swalContainer.style.zIndex = "9999";
      }
    },
  });
}

export function showError(title: string, message?: string) {
  return Swal.fire({
    icon: "error",
    title,
    text: message,
    confirmButtonColor: "#8b2626",
    confirmButtonText: "OK",
    allowOutsideClick: false,
    didOpen: () => {
      document.body.style.pointerEvents = "auto";
      const swalContainer = document.querySelector(
        ".swal2-container",
      ) as HTMLElement;
      if (swalContainer) {
        swalContainer.style.pointerEvents = "auto";
        swalContainer.style.zIndex = "9999";
      }
    },
  });
}

export function showInfo(title: string, message?: string) {
  return Swal.fire({
    icon: "info",
    title,
    text: message,
    confirmButtonColor: "#8b2626",
    confirmButtonText: "OK",
    allowOutsideClick: false,
    didOpen: () => {
      document.body.style.pointerEvents = "auto";
      const swalContainer = document.querySelector(
        ".swal2-container",
      ) as HTMLElement;
      if (swalContainer) {
        swalContainer.style.pointerEvents = "auto";
        swalContainer.style.zIndex = "9999";
      }
    },
  });
}

export function showConfirm(title: string, message?: string): Promise<boolean> {
  return Swal.fire({
    icon: "warning",
    title,
    text: message,
    showCancelButton: true,
    confirmButtonColor: "#8b2626",
    cancelButtonColor: "#a0908b",
    confirmButtonText: "Yes",
    cancelButtonText: "Cancel",
    allowOutsideClick: false,
    didOpen: () => {
      document.body.style.pointerEvents = "auto";
      const swalContainer = document.querySelector(
        ".swal2-container",
      ) as HTMLElement;
      if (swalContainer) {
        swalContainer.style.pointerEvents = "auto";
        swalContainer.style.zIndex = "9999";
      }
    },
  }).then((result) => result.isConfirmed);
}

export function showLoading(title: string, message?: string) {
  return Swal.fire({
    title,
    text: message,
    icon: "info",
    allowOutsideClick: false,
    allowEscapeKey: false,
    didOpen: () => {
      document.body.style.pointerEvents = "auto";
      const swalContainer = document.querySelector(
        ".swal2-container",
      ) as HTMLElement;
      if (swalContainer) {
        swalContainer.style.pointerEvents = "auto";
        swalContainer.style.zIndex = "9999";
      }
      Swal.showLoading();
    },
  });
}

export function closeLoading() {
  return Swal.close();
}
