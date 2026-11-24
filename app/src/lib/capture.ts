// Film capture mode (localStorage br-capture=1): keep the WebGL drawing buffer so Chrome's
// screencast records 3D frames. Off for everyone else (it costs a little performance).
export const CAPTURE = (() => {
  try {
    return localStorage.getItem("br-capture") === "1";
  } catch {
    return false;
  }
})();
