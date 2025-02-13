import cornerstone from 'cornerstone-core'
import cornerstoneTools from 'cornerstone-tools'
import { rotatedEllipticalRoiCursor } from './cursor'
import pointInRotatedEllipse from './util/pointInRotatedEllipse'
import movePerpendicularHandle from './manipulators/movePerpendicularHandle'
import drawRotatedEllipse from './drawing/drawRotatedEllipse'
import getROITextBoxCoords from './util/getROITextBoxCoords'
import calculateRotatedEllipseStatistics from './util/calculateRotatedEllipseStatistics'
import { setToolCursor } from './setToolCursor'

const BaseAnnotationTool = cornerstoneTools.import('base/BaseAnnotationTool')
const throttle = cornerstoneTools.import('util/throttle')
const EVENTS = cornerstoneTools.EVENTS
const getLogger = cornerstoneTools.import('util/getLogger')
const logger = getLogger('tools:annotation:RotatedEllipticalRoiTool')
const handleActivator = cornerstoneTools.import('manipulators/handleActivator')
const anyHandlesOutsideImage = cornerstoneTools.import(
  'manipulators/anyHandlesOutsideImage',
)
const getHandleNearImagePoint = cornerstoneTools.import(
  'manipulators/getHandleNearImagePoint',
)
const moveAllHandles = cornerstoneTools.import('manipulators/moveAllHandles')
const moveNewHandle = cornerstoneTools.import('manipulators/moveNewHandle')
const getPixelSpacing = cornerstoneTools.import('util/getPixelSpacing')
const getNewContext = cornerstoneTools.import('drawing/getNewContext')
const draw = cornerstoneTools.import('drawing/draw')
const setShadow = cornerstoneTools.import('drawing/setShadow')
const drawHandles = cornerstoneTools.import('drawing/drawHandles')
const drawLinkedTextBox = cornerstoneTools.import('drawing/drawLinkedTextBox')
const numbersWithCommas = cornerstoneTools.import('util/numbersWithCommas')
const calculateSUV = cornerstoneTools.import('util/calculateSUV')

export default class RotatedEllipticalRoiTool extends BaseAnnotationTool {
  constructor(props = {}) {
    const defaultProps = {
      name: 'RotatedEllipticalRoiMouseTouch',
      supportedInteractionTypes: ['Mouse', 'Touch'],
      configuration: {
        // showMinMax: false,
        // showHounsfieldUnits: true,
      },
      svgCursor: rotatedEllipticalRoiCursor,
    }

    super(props, defaultProps)

    this.throttledUpdateCachedStats = throttle(this.updateCachedStats, 110)
  }

  addNewMeasurement(evt: any, interactionType: any ) {
    const eventData = evt.detail
    const { element, image } = eventData
    const measurementData: any = this.createNewMeasurement(eventData)

    cornerstoneTools.addToolState(element, this.name, measurementData)
    const { end } = measurementData.handles

    cornerstone.updateImage(element)

    moveNewHandle(
      eventData,
      this.name,
      measurementData,
      end,
      {},
      interactionType,
      () => {
        if (anyHandlesOutsideImage(eventData, measurementData.handles)) {
          // Delete the measurement
          cornerstoneTools.removeToolState(element, this.name, measurementData)
        } else {
          const center = getCenter(measurementData.handles)

          measurementData.handles.perpendicularPoint.x = center.x
          measurementData.handles.perpendicularPoint.y = center.y
          measurementData.handles.perpendicularPoint.isFirst = false
          this.updateCachedStats(image, element, measurementData)
          cornerstone.triggerEvent(
            element,
            EVENTS.MEASUREMENT_COMPLETED,
            measurementData,
          )
        }
      },
    )
  }

  createNewMeasurement(eventData: any) {
    const goodEventData =
      eventData && eventData.currentPoints && eventData.currentPoints.image

    if (!goodEventData) {
      logger.error(
        `required eventData not supplied to tool ${this.name}'s createNewMeasurement`,
      )

      return
    }

    return {
      visible: true,
      active: true,
      color: undefined,
      invalidated: true,
      shortestDistance: 0,
      handles: {
        start: {
          x: eventData.currentPoints.image.x,
          y: eventData.currentPoints.image.y,
          highlight: true,
          active: false,
          key: 'start',
        },
        end: {
          x: eventData.currentPoints.image.x,
          y: eventData.currentPoints.image.y,
          highlight: true,
          active: true,
          key: 'end',
        },
        perpendicularPoint: {
          x: eventData.currentPoints.image.x,
          y: eventData.currentPoints.image.y,
          highlight: true,
          active: false,
          isFirst: true,
          key: 'perpendicular',
        },
        initialRotation: eventData.viewport.rotation,
        textBox: {
          active: false,
          hasMoved: false,
          movesIndependently: false,
          drawnIndependently: true,
          allowedOutsideImage: true,
          hasBoundingBox: true,
        },
      },
    }
  }

  pointNearTool(
    element: any,
    data: any,
    coords: any,
    interactionType: any = 'mouse',
  ) {
    const hasStartAndEndHandles =
      data && data.handles && data.handles.start && data.handles.end
    const validParameters = hasStartAndEndHandles

    if (!validParameters) {
      logger.warn(
        `invalid parameters supplied to tool ${this.name}'s pointNearTool`,
      )
    }

    if (!validParameters || data.visible === false) {
      return false
    }

    const distance = interactionType === 'mouse' ? 15 : 25
    const center = getCenter(data.handles)
    const startCanvas = cornerstone.pixelToCanvas(element, data.handles.start)
    const endCanvas = cornerstone.pixelToCanvas(element, data.handles.end)
    const perpendicularCanvas = cornerstone.pixelToCanvas(
      element,
      data.handles.perpendicularPoint,
    )
    const centerCanvas = cornerstone.pixelToCanvas(element, center)

    const square = (x: any) => x * x
    const minorEllipse = {
      xRadius:
        Math.sqrt(
          square(startCanvas.x - endCanvas.x) +
            square(startCanvas.y - endCanvas.y),
        ) /
          2 -
        distance / 2,
      yRadius:
        Math.sqrt(
          square(perpendicularCanvas.x - centerCanvas.x) +
            square(perpendicularCanvas.y - centerCanvas.y),
        ) -
        distance / 2,
      center: centerCanvas,
    }

    const majorEllipse = {
      xRadius:
        Math.sqrt(
          square(startCanvas.x - endCanvas.x) +
            square(startCanvas.y - endCanvas.y),
        ) /
          2 +
        distance / 2,
      yRadius:
        Math.sqrt(
          square(perpendicularCanvas.x - centerCanvas.x) +
            square(perpendicularCanvas.y - centerCanvas.y),
        ) +
        distance / 2,
      center: centerCanvas,
    }
    const theta = Math.atan2(
      endCanvas.y - startCanvas.y,
      endCanvas.x - startCanvas.x,
    )

    const pointInMinorEllipse = pointInRotatedEllipse(
      minorEllipse,
      coords,
      theta,
    )
    const pointInMajorEllipse = pointInRotatedEllipse(
      majorEllipse,
      coords,
      theta,
    )

    if (pointInMajorEllipse && !pointInMinorEllipse) {
      return true
    }

    return false
  }

  mouseMoveCallback(e: any) {
    const eventData = e.detail
    const { element } = eventData

    cornerstoneTools.toolCoordinates.setCoords(eventData)

    // If we have no tool data for this element, do nothing
    const toolData = cornerstoneTools.getToolState(element, this.name)

    if (!toolData) {
      return
    }

    // We have tool data, search through all data
    // And see if we can activate a handle
    let imageNeedsUpdate = false

    for (let i = 0; i < toolData.data.length; i++) {
      // Get the cursor position in canvas coordinates
      const coords = eventData.currentPoints.canvas

      const data = toolData.data[i]

      if (handleActivator(eventData.element, data.handles, coords) === true) {
        imageNeedsUpdate = true
      }

      if (
        (this.pointNearTool(element, data, coords) && !data.active) ||
        (!this.pointNearTool(element, data, coords) && data.active)
      ) {
        data.active = !data.active
        imageNeedsUpdate = true
      }
    }

    // Handle activation status changed, redraw the image
    if (imageNeedsUpdate === true) {
      cornerstone.updateImage(eventData.element)
    }
  }

  handleSelectedCallback(e: any) {
    const eventData = e.detail
    let data: any
    const { element } = eventData

    const handleDoneMove = (handle: any) => {
      data.invalidated = true
      if (anyHandlesOutsideImage(eventData, data.handles)) {
        // Delete the measurement
        cornerstoneTools.removeToolState(element, this.name, data)
      }

      if (handle) {
        handle.moving = false
        handle.selected = true
      }

      setToolCursor(this.element, this.svgCursor)

      cornerstone.updateImage(element)
      element.addEventListener(EVENTS.MOUSE_MOVE, this.mouseMoveCallback)
      element.addEventListener(EVENTS.TOUCH_DRAG, this.mouseMoveCallback);
    }

    const coords = eventData.startPoints.canvas
    const toolData = cornerstoneTools.getToolState(e.currentTarget, this.name)

    if (!toolData) {
      return
    }

    let i

    // Now check to see if there is a handle we can move
    for (i = 0; i < toolData.data.length; i++) {
      data = toolData.data[i]
      const distance = 6
      const handle = getHandleNearImagePoint(
        element,
        data.handles,
        coords,
        distance,
      )

      if (handle) {
        element.removeEventListener(EVENTS.MOUSE_MOVE, this.mouseMoveCallback)
        element.removeEventListener(EVENTS.TOUCH_DRAG, this.mouseMoveCallback);
        data.active = true
        movePerpendicularHandle(
          eventData,
          this.name,
          data,
          handle,
          handleDoneMove,
          true,
        )
        e.stopImmediatePropagation()
        e.stopPropagation()
        e.preventDefault()

        return
      }
    }

    // Now check to see if there is a line we can move
    // Now check to see if we have a tool that we can move
    if (!this.pointNearTool) {
      return
    }

    const opt = {
      deleteIfHandleOutsideImage: true,
      preventHandleOutsideImage: false,
    }

    for (i = 0; i < toolData.data.length; i++) {
      data = toolData.data[i]
      data.active = false
      if (this.pointNearTool(element, data, coords)) {
        data.active = true
        element.removeEventListener(EVENTS.MOUSE_MOVE, this.mouseMoveCallback)
        element.removeEventListener(EVENTS.TOUCH_DRAG, this.mouseMoveCallback);
        // moveAllHandles(e, data, toolData, this.name, opt, handleDoneMove)
        e.stopImmediatePropagation()
        e.stopPropagation()
        e.preventDefault()

        return
      }
    }
  }

  updateCachedStats(image: any, element: HTMLElement, data: any) {
    const seriesModule =
      cornerstone.metaData.get('generalSeriesModule', image.imageId) || {}
    const modality = seriesModule.modality
    const pixelSpacing = getPixelSpacing(image)

    const stats = _calculateStats(
      image,
      element,
      data.handles,
      modality,
      pixelSpacing,
    )

    data.cachedStats = stats
    data.invalidated = false
  }

  renderToolData(evt: any) {
    const toolData = cornerstoneTools.getToolState(evt.currentTarget, this.name)

    if (!toolData) {
      return
    }

    const eventData = evt.detail
    const { image, element } = eventData
    const lineWidth = cornerstoneTools.toolStyle.getToolWidth()
    const { handleRadius, drawHandlesOnHover } = this.configuration
    const context = getNewContext(eventData.canvasContext.canvas)
    const { rowPixelSpacing, colPixelSpacing } = getPixelSpacing(image)

    // Meta
    const seriesModule =
      cornerstone.metaData.get('generalSeriesModule', image.imageId) || {}

    // Pixel Spacing
    const modality = seriesModule.modality
    const hasPixelSpacing = rowPixelSpacing && colPixelSpacing

    draw(context, (context: any) => {
      // If we have tool data for this element - iterate over each set and draw it
      for (let i = 0; i < toolData.data.length; i++) {
        const data = toolData.data[i]

        if (data.visible === false) {
          continue
        }

        // Configure
        const color = cornerstoneTools.toolColors.getColorIfActive(data)
        const handleOptions = {
          color,
          handleRadius,
          drawHandlesIfActive: drawHandlesOnHover,
        }

        setShadow(context, this.configuration)

        // Draw
        drawRotatedEllipse(
          context,
          element,
          data.handles.start,
          data.handles.end,
          data.handles.perpendicularPoint,
          {
            color,
          },
          'pixel',
          data.handles.initialRotation,
        )
        drawHandles(context, eventData, data.handles, handleOptions)

        // Update textbox stats
        if (data.invalidated === true) {
          if (data.cachedStats) {
            this.throttledUpdateCachedStats(image, element, data)
          } else {
            this.updateCachedStats(image, element, data)
          }
        }

        // Default to textbox on right side of ROI
        if (!data.handles.textBox.hasMoved) {
          const defaultCoords = getROITextBoxCoords(
            eventData.viewport,
            data.handles,
          )

          Object.assign(data.handles.textBox, defaultCoords)
        }

        const textBoxAnchorPoints = (handles: any) =>
          _findTextBoxAnchorPoints(handles)
        const textBoxContent = _createTextBoxContent(
          context,
          image.color,
          data.cachedStats,
          modality,
          hasPixelSpacing,
          this.configuration,
        )

        drawLinkedTextBox(
          context,
          element,
          data.handles.textBox,
          textBoxContent,
          data.handles,
          textBoxAnchorPoints,
          color,
          lineWidth,
          10,
          true,
        )
      }
    })
  }
}

/**
 *
 *
 * @param {*} handles
 * @returns {Array.<{x: number, y: number}>}
 */
function _findTextBoxAnchorPoints(handles: any) {
  // Retrieve the bounds of the ellipse (left, top, width, and height)
  return [
    {
      x: handles.start.x,
      y: handles.start.y,
    },
    {
      x: handles.end.x,
      y: handles.end.y,
    },
    {
      x: handles.perpendicularPoint.x,
      y: handles.perpendicularPoint.y,
    },
  ]
}

/**
 *
 *
 * @param {*} context
 * @param {*} isColorImage
 * @param {*} { area, mean, stdDev, min, max, meanStdDevSUV }
 * @param {*} modality
 * @param {*} hasPixelSpacing
 * @param {*} [options={}] - { showMinMax, showHounsfieldUnits }
 * @returns {string[]}
 */
function _createTextBoxContent(
  context: any,
  isColorImage: any,
  statistics: any = {},
  modality: any,
  hasPixelSpacing: any,
  options: any = {},
) {
  const { area, mean, stdDev, min, max, meanStdDevSUV } = statistics
  const showMinMax = options.showMinMax || false
  const showHounsfieldUnits = options.showHounsfieldUnits !== false
  const textLines: any[] = []

  // Don't display mean/standardDev for color images
  const otherLines = []

  if (!isColorImage) {
    const hasStandardUptakeValues = meanStdDevSUV && meanStdDevSUV.mean !== 0
    const suffix = modality === 'CT' && showHounsfieldUnits ? ' HU' : ''

    let meanString = `Mean: ${numbersWithCommas(mean.toFixed(2))}${suffix}`
    const stdDevString = `Std Dev: ${numbersWithCommas(
      stdDev.toFixed(2),
    )}${suffix}`

    // If this image has SUV values to display, concatenate them to the text line
    if (hasStandardUptakeValues) {
      const SUVtext = ' SUV: '

      const meanSuvString = `${SUVtext}${numbersWithCommas(
        meanStdDevSUV.mean.toFixed(2),
      )}`
      const stdDevSuvString = `${SUVtext}${numbersWithCommas(
        meanStdDevSUV.stdDev.toFixed(2),
      )}`

      const targetStringLength = Math.floor(
        context.measureText(`${stdDevString}     `).width,
      )

      while (context.measureText(meanString).width < targetStringLength) {
        meanString += ' '
      }

      otherLines.push(`${meanString}${meanSuvString}`)
      otherLines.push(`${stdDevString}     ${stdDevSuvString}`)
    } else {
      otherLines.push(`${meanString}     ${stdDevString}`)
    }

    if (showMinMax) {
      let minString = `Min: ${min}${suffix}`
      const maxString = `Max: ${max}${suffix}`
      const targetStringLength = hasStandardUptakeValues
        ? Math.floor(context.measureText(`${stdDevString}     `).width)
        : Math.floor(context.measureText(`${meanString}     `).width)

      while (context.measureText(minString).width < targetStringLength) {
        minString += ' '
      }

      otherLines.push(`${minString}${maxString}`)
    }
  }

  textLines.push(_formatArea(area, hasPixelSpacing))
  otherLines.forEach(x => textLines.push(x))

  return textLines
}

/**
 *
 *
 * @param {*} area
 * @param {*} hasPixelSpacing
 * @returns {string} The formatted label for showing area
 */
function _formatArea(area: number, hasPixelSpacing: any) {
  // This uses Char code 178 for a superscript 2
  const suffix = hasPixelSpacing
    ? ` mm${String.fromCharCode(178)}`
    : ` px${String.fromCharCode(178)}`

  return `Area: ${numbersWithCommas(area.toFixed(2))}${suffix}`
}

/**
 *
 *
 * @param {*} image
 * @param {*} element
 * @param {*} handles
 * @param {*} modality
 * @param {*} pixelSpacing
 * @returns {Object} The Stats object
 */
function _calculateStats(
  image: any,
  element: HTMLElement,
  handles: any,
  modality: any,
  pixelSpacing: any,
) {
  // Retrieve the bounds of the ellipse in image coordinates
  if (handles.perpendicularPoint.isFirst) {
    return {
      area: 0,
      count: 0,
      mean: 0,
      variance: 0,
      stdDev: 0,
      min: 0,
      max: 0,
      meanStdDevSUV: 0,
    }
  }
  const ellipseCoordinates: any = _getEllipseImageCoordinates(
    handles.start,
    handles.end,
  )
  const center = getCenter(handles)
  const square = (x: any) => x * x
  const xRadius =
    Math.sqrt(
      square(handles.start.x - handles.end.x) +
        square(handles.start.y - handles.end.y),
    ) / 2
  const yRadius = Math.sqrt(
    square(handles.perpendicularPoint.x - center.x) +
      square(handles.perpendicularPoint.y - center.y),
  )
  const theta = Math.atan2(
    handles.end.y - handles.start.y,
    handles.end.x - handles.start.x,
  )

  ellipseCoordinates.xRadius = xRadius
  ellipseCoordinates.yRadius = yRadius
  ellipseCoordinates.center = center

  // Retrieve the array of pixels that the ellipse bounds cover
  const pixels = cornerstone.getPixels(
    element,
    ellipseCoordinates.left,
    ellipseCoordinates.top,
    ellipseCoordinates.width,
    ellipseCoordinates.height,
  )

  // Calculate the mean & standard deviation from the pixels and the ellipse details.
  const ellipseMeanStdDev = calculateRotatedEllipseStatistics(
    pixels,
    ellipseCoordinates,
    theta,
  )

  let meanStdDevSUV

  if (modality === 'PT') {
    meanStdDevSUV = {
      mean: calculateSUV(image, ellipseMeanStdDev.mean, true) || 0,
      stdDev: calculateSUV(image, ellipseMeanStdDev.stdDev, true) || 0,
    }
  }

  // Calculate the image area from the ellipse dimensions and pixel spacing
  const transformedHalfWidth =
    Math.abs(center.x - handles.start.x) * (pixelSpacing.colPixelSpacing || 1)
  const transformedHalfHeight =
    Math.abs(center.y - handles.start.y) * (pixelSpacing.rowPixelSpacing || 1)
  const transformedHalfLongestDistance = Math.sqrt(
    square(transformedHalfWidth) + square(transformedHalfHeight),
  )

  const transformedPerpendicularWidth =
    Math.abs(center.x - handles.perpendicularPoint.x) *
    (pixelSpacing.colPixelSpacing || 1)
  const transformedPerpendicularHeight =
    Math.abs(center.y - handles.perpendicularPoint.y) *
    (pixelSpacing.rowPixelSpacing || 1)
  const transformedHalfShortestDistance = Math.sqrt(
    square(transformedPerpendicularWidth) +
      square(transformedPerpendicularHeight),
  )
  const area =
    Math.PI * transformedHalfLongestDistance * transformedHalfShortestDistance

  return {
    area: area || 0,
    count: ellipseMeanStdDev.count || 0,
    mean: ellipseMeanStdDev.mean || 0,
    variance: ellipseMeanStdDev.variance || 0,
    stdDev: ellipseMeanStdDev.stdDev || 0,
    min: ellipseMeanStdDev.min || 0,
    max: ellipseMeanStdDev.max || 0,
    meanStdDevSUV,
  }
}

/**
 * Retrieve the bounds of the ellipse in image coordinates
 *
 * @param {*} startHandle
 * @param {*} endHandle
 * @returns {{ left: number, top: number, width: number, height: number }}
 */
function _getEllipseImageCoordinates(startHandle: any, endHandle: any) {
  return {
    left: Math.round(Math.min(startHandle.x, endHandle.x)),
    top: Math.round(Math.min(startHandle.y, endHandle.y)),
    width: Math.round(Math.abs(startHandle.x - endHandle.x)),
    height: Math.round(Math.abs(startHandle.y - endHandle.y)),
  }
}

const getCenter = (handles: any) => {
  const { start, end } = handles
  const w = Math.abs(start.x - end.x)
  const h = Math.abs(start.y - end.y)
  const xMin = Math.min(start.x, end.x)
  const yMin = Math.min(start.y, end.y)

  const center = {
    x: xMin + w / 2,
    y: yMin + h / 2,
  }

  return center
}
