Oseo logo
=========

Oseo takes its name from *oseo* (/o.sʌ/, “OH-suh”), the Sino-Korean reading of
[鼯鼠], meaning “flying squirrel.” My spouse, Lisa Yu (劉俐思), drew a flying
squirrel in mid-glide for the logo.

The [original sketches](./logo-sketch.jpg) show several versions. The final
logo follows the small sketch at the bottom of the sheet, with two curved
eyes, outstretched paws, and a tail that bends to one side. The outline was
redrawn with Bézier curves to smooth out the rough edges while keeping the
uneven silhouette of the drawing.

[*logo.svg*](./logo.svg) is the master artwork. It uses a single path on a
transparent background, with cutouts for the eyes and nose. When used inline,
its fill follows the surrounding text color through [`currentColor`].

[*logo-autocolor.svg*](./logo-autocolor.svg) uses the same artwork but displays
it in black in light mode and white in dark mode, even when loaded through an
`<img>` element. To make the inline version follow the text color instead,
set `--oseo-logo-fill: currentColor` on the `<svg>` element.

[鼯鼠]: https://en.wiktionary.org/wiki/%E9%BC%AF%E9%BC%A0
[`currentColor`]: https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Values/color_value#currentcolor_keyword


License
-------

Both SVGs and [*logo-sketch.jpg*](./logo-sketch.jpg) are © Lisa Yu (劉俐思)
and are licensed under [CC BY-SA 4.0]. All three files carry the creator and
license information in their metadata.

[CC BY-SA 4.0]: https://creativecommons.org/licenses/by-sa/4.0/
