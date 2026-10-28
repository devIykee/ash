// Runs before paint so a saved theme never flashes the other one.
export const THEME_SCRIPT = `try{var t=localStorage.getItem("ash.theme");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`;
