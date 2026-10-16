const fs = require('fs');
let css = fs.readFileSync('app/globals.css', 'utf8');

const loaderCss = `
/* 4 dots rotating loader */
.loader-dots {
  --_g: no-repeat radial-gradient(farthest-side, currentColor 94%, #0000);
  background:
    var(--_g) 0    0,
    var(--_g) 100% 0,
    var(--_g) 100% 100%,
    var(--_g) 0    100%;
  background-size: 40% 40%;
  animation: l38 .5s infinite;
}
@keyframes l38 {
  100% {background-position: 100% 0, 100% 100%, 0 100%, 0 0}
}
`;

if (!css.includes('.loader-dots')) {
  fs.writeFileSync('app/globals.css', css + '\n' + loaderCss);
}
