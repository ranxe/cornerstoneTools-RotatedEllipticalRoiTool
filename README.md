---
Modified cornerstoneTools-RotatedEllipticalRoiTool for touch event

(forked from https://github.com/sisobus/cornerstoneTools-RotatedEllipticalRoiTool)

---

# cornerstoneTools-RotatedEllipticalRoiTool


An annotation tool of drawing rotated elliptical roi. It is 3rd party library of [cornerstoneTools](https://github.com/cornerstonejs/cornerstoneTools).<br>
You can try to test this tool in [here](https://examples.sisobus.com/rotated-elliptical-roi)

## Demo

<img src="https://user-images.githubusercontent.com/3329885/58860190-87c5d480-86e6-11e9-9564-018ad626ae30.gif" width="400">


## Installation

```sh
$ yarn add cornerstone-tools-rotated-elliptical-roi-mouse-touch-tool
```

or

```sh
$ npm i cornerstone-tools-rotated-elliptical-roi-mouse-touch-tool
```

This library has dependencies below

* [cornerstone-core](https://github.com/cornerstonejs/cornerstone)
* [cornerstone-tools](https://github.com/cornerstonejs/cornerstoneTools)
* [cornerstone-math](https://github.com/cornerstonejs/cornerstoneMath)


## Examples

#### browser [example](https://github.com/sisobus/cornerstoneTools-RotatedEllipticalRoiTool/blob/master/example/index.html)
```html
<script src="../dist/rotated-elliptical-roi-tool.umd.js"></script>
<script>
  cornerstoneTools.init({
    showSVGCursors: true,
  });
  cornerstoneTools.addTool(RotatedEllipticalRoiTool);
  cornerstoneTools.setToolActive("RotatedEllipticalRoi", { mouseButtonMask: 1 });
</script>
```

#### node [example](https://github.com/sisobus/cornerstoneTools-RotatedEllipticalRoiTool/blob/master/example/react.js)
```js
import RotatedEllipticalRoiTool from "cornerstone-tools-rotated-elliptical-roi-tool";
cornerstoneTools.init({
  showSVGCursors: true,
})
cornerstoneTools.addTool(RotatedEllipticalRoiTool)
cornerstoneTools.setToolActive("RotatedEllipticalRoi", {
  mouseButtonMask: 1,
})
```


## LICENSE

MIT

