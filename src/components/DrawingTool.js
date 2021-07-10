import React, { Component } from 'react';
import Button from '@material-ui/core/Button';
import Popover from '@material-ui/core/Popover';
import Slider from '@material-ui/core/Slider';
import Menu from '@material-ui/core/Menu';
import MenuItem from '@material-ui/core/MenuItem';
// import Editor from 'react-simple-code-editor';
import Tooltip from '@material-ui/core/Tooltip';
import DeleteIcon from '@material-ui/icons/Delete';
import UndoIcon from '@material-ui/icons/Undo';
import CreateIcon from '@material-ui/icons/Create';
import CreateOutlinedIcon from '@material-ui/icons/CreateOutlined';
import TextFieldsIcon from '@material-ui/icons/TextFields';
import ImageIcon from '@material-ui/icons/Image';
import RadioButtonUncheckedIcon from '@material-ui/icons/RadioButtonUnchecked';
import CropSquareIcon from '@material-ui/icons/CropSquare';
import FavoriteBorderOutlinedIcon from '@material-ui/icons/FavoriteBorderOutlined';
import FavoriteOutlinedIcon from '@material-ui/icons/FavoriteOutlined';
import RemoveIcon from '@material-ui/icons/Remove';
import FlipToFrontIcon from '@material-ui/icons/FlipToFront';
import FlipToBackIcon from '@material-ui/icons/FlipToBack';
import { getBase64FromUrl, compileLaTeX } from './utils';
import CodeIcon from '@material-ui/icons/Code';
import * as Mousetrap from 'mousetrap';
// import { highlight, languages } from 'prismjs/components/prism-core';
// import 'prismjs/components/prism-clike';
// import 'prismjs/components/prism-javascript';
import { ColorBox } from 'material-ui-color';
import { fabric } from 'fabric';
import { fabricStarterCode } from './constants';
import uuid from 'uuid/v4';


const palette = {
  red: '#ea292a',
  blue: '#4e4ef3',
  teal: '#237882',
  orange: 'orange',
  gray: 'gray',
  black: 'black',
  white: 'white',
};

// see http://fabricjs.com/custom-controls-polygon
function linePositionHandler(dim, finalMatrix, fabricObject) {
  const x = fabricObject.calcLinePoints()[this.pointIndex === 0 ? 'x1' : 'x2'],
        y = fabricObject.calcLinePoints()[this.pointIndex === 0 ? 'y1' : 'y2'];
  return fabric.util.transformPoint(
    { x: x, y: y },
    fabric.util.multiplyTransformMatrices(
      fabricObject.canvas.viewportTransform,
      fabricObject.calcTransformMatrix()
    )
  );
}

function polygonPositionHandler(dim, finalMatrix, fabricObject) {
  const x = (fabricObject.points[this.pointIndex].x - fabricObject.pathOffset.x),
        y = (fabricObject.points[this.pointIndex].y - fabricObject.pathOffset.y);
  return fabric.util.transformPoint(
    { x: x, y: y },
    fabric.util.multiplyTransformMatrices(
      fabricObject.canvas.viewportTransform,
      fabricObject.calcTransformMatrix()
    )
  );
}

function lineActionHandler(eventData, transform, x, y) {
  const line = transform.target;
  if (!window.hasLoggedLine) {
    window.hasLoggedLine = true;
  }
  const linePoints = line.calcLinePoints();
  const lineTransform = line.calcTransformMatrix();
  const p1 = fabric.util.transformPoint({ x: linePoints.x1, y: linePoints.y1 }, lineTransform);
  const p2 = fabric.util.transformPoint({ x: linePoints.x2, y: linePoints.y2 }, lineTransform);
  if (line.__corner === 'p1') {
    if (line.controlCache === 'p1' + line.top + line.left) {
      line.set({ x1: x, y1: y });
    } else {
      line.set({ x1: x, y1: y, x2: p2.x, y2: p2.y });
    }
    line.controlCache = 'p1' + line.top + line.left;
  } else {
    if (line.controlCache === 'p2' + line.top + line.left) {
      line.set({ x2: x, y2: y });
    } else {
      line.set({ x2: x, y2: y, x1: p1.x, y1: p1.y });
    }
    line.controlCache = 'p2' + line.top + line.left;
  }
  return true;
}

function polygonActionHandler(eventData, transform, x, y) {
  const polygon = transform.target,
        currentControl = polygon.controls[polygon.__corner],
        mouseLocalPosition = polygon.toLocalPoint(new fabric.Point(x, y), 'center', 'center'),
        polygonBaseSize = polygon._getNonTransformedDimensions(),
        size = polygon._getTransformedDimensions(0, 0),
        finalPointPosition = {
          x: mouseLocalPosition.x * polygonBaseSize.x / size.x + polygon.pathOffset.x,
          y: mouseLocalPosition.y * polygonBaseSize.y / size.y + polygon.pathOffset.y
        };
  polygon.points[currentControl.pointIndex] = finalPointPosition;
  return true;
}

function anchorWrapper(anchorIndex, fn) {
  return function(eventData, transform, x, y) {
    var fabricObject = transform.target,
        absolutePoint = fabric.util.transformPoint({
            x: (fabricObject.points[anchorIndex].x - fabricObject.pathOffset.x),
            y: (fabricObject.points[anchorIndex].y - fabricObject.pathOffset.y),
        }, fabricObject.calcTransformMatrix()),
        actionPerformed = fn(eventData, transform, x, y),
        polygonBaseSize = fabricObject._getNonTransformedDimensions(),
        newX = (fabricObject.points[anchorIndex].x - fabricObject.pathOffset.x) / polygonBaseSize.x,
        newY = (fabricObject.points[anchorIndex].y - fabricObject.pathOffset.y) / polygonBaseSize.y;
    fabricObject.setPositionByOrigin(absolutePoint, newX + 0.5, newY + 0.5);
    return actionPerformed;
  }
}

function regularPolygon(numSides) {
  return Array.from(Array(numSides)).map((_, i) => ({
    x: 100 + 75 * Math.cos(2*Math.PI*i/numSides), 
    y: 100 + 75 * Math.sin(2*Math.PI*i/numSides),
  }))
}

class DrawingTool extends Component {

  constructor() {
    super()
    this.refs = { canvas: {}}
    this.id = uuid();
    this.lastUpdate = new Date();
    this.snapshots = [];
    this.handleCopy = this.handleCopy.bind(this);
    this.handlePaste = this.handlePaste.bind(this);
    this.shouldOpenPicker = true;
    this.state = { 
      fabricCode: fabricStarterCode,
      strokeFill: null,
      defaultColor: '#237882',
      pickerColor: null,
      menuOpenRef: null,
      sliderOpenRef: null,
      editorOpenRef: null,
      pickerOpenRef: null,
      strokeWidth: 3,
      isDrawingMode: false,
    };
  }

  async sanitize(svg) {
    // we have to base64 any external resources, since svgs displayed
    // using the img tag is not allowed to use them (in general)
    const match = svg.match(/xlink:href="(.*?)"/);
    if (match && match.length > 1) {
      const url = match[1];
      const base64 = await getBase64FromUrl(url);
      return await this.sanitize(svg.replace(/xlink:href="(.*?)"/, 'href="' + base64 + '"'));
    }
    return svg;
  }

  openMenu(event) {
    this.setState({ menuOpenRef: event.currentTarget });
  }

  handleClose(event) {
    this.setState({ menuOpenRef: null });
  }

  openSlider(event) {
    this.setState({ sliderOpenRef: event.currentTarget });
  }

  openPicker(event) {
    if (this.shouldOpenPicker) {
      this.setState( {pickerOpenRef: event.currentTarget});
    } else {
      this.setColor('#' + this.state.pickerColor.hex);
      this.shouldOpenPicker = true;
    }
  }

  closeSlider() {
    this.setState({ sliderOpenRef: null });
  }

  closePicker() {
    this.setState({ pickerOpenRef: null });
    if (this.state.pickerColor) this.shouldOpenPicker = false;
  }

  openEditor(event) {
    this.setState({ editorOpenRef: event.currentTarget });
  }

  closeEditor() {
    this.setState({ editorOpenRef: null });
  }

  componentDidMount() {
    const canvas = new fabric.Canvas(this.id, {backgroundColor: 'white'});
    this.canvas = canvas;
    try {
      let drawing = this.props.initialJson ? this.props.initialJson : localStorage.getItem('prismia-drawing');
      if (typeof drawing === 'string') try {
        drawing = JSON.parse(drawing);
      } catch (err) {
        console.log(err); 
      }
      if (drawing?.fabricJson) {
        canvas.loadFromJSON(JSON.parse(drawing.fabricJson), canvas.renderAll.bind(canvas));
      }
      if (drawing?.fabricCode) {
        this.setState({ fabricCode: drawing.fabricCode });
      }
    } catch (e) {
      console.error(e);
    }
    if (this.props.watermarkUrl) {
      this.setOverlayImage(this.props.watermarkUrl);
    }
    if (this.props.setTyping) {
      canvas.on('after:render', () => this.handleRender());
    } 
    canvas.on('mouse:down', (event) => this.handleMouseDown(event));
    canvas.on('mouse:move', (event) => this.handleMouseMove(event));
    canvas.on('object:added', () => this.handleChange())
    canvas.on('object:modified', () => this.handleChange())
    window.addEventListener('copy', this.handleCopy);
    window.addEventListener('paste', this.handlePaste);
    this.handleChange(); // need the very first board state in the revision history
    this.canvas.freeDrawingBrush.decimate = 4;
    Mousetrap.bind('mod+z', () => this.undo());
    Mousetrap.bind('mod+shift+z', () => this.undo(1));
    Mousetrap.bind('shift+p', () => this.toggleFreeDrawingMode());
    Mousetrap.bind('shift+d', () => this.clear());
    Mousetrap.bind('shift+r', () => this.addRectangle());    
    Mousetrap.bind('shift+l', () => this.addLine());
    Mousetrap.bind('shift+c', () => this.addCircle());
    Mousetrap.bind('shift+s', () => this.setState({strokeFill: 'stroke'}));
    Mousetrap.bind('shift+f', () => this.setState({strokeFill: 'fill'}));
    Mousetrap.bind('shift+t', () => this.addTextBox());
    Mousetrap.bind('esc', () => this.closeActiveTools());
  }

  handleMouseDown(event) {
    const p = this.canvas.getPointer(event.e);
    if (this.activeLine) {
      this.activeLine.setCoords();
      if (this.addArrowHead) {
        this.addArrow(this.activeLine, p);
      }
      this.activeLine = null;
      this.handleChange();
    } else if (this.isDrawingLine) {
      const line = new fabric.Line([p.x, p.y, p.x, p.y], {
        stroke: this.state.defaultColor,
        strokeWidth: this.state.strokeWidth,
        perPixelTargetFind: true,
        hasBorders: false,
        objectCaching: false,
        evented: false,
        strokeLineCap: 'round',
      });
      line.cornerStyle = 'circle';
      line.cornerColor = 'rgba(0,0,255,0.5)';
      line.controls = {
        p1: new fabric.Control({
          positionHandler: linePositionHandler,
          actionHandler: lineActionHandler,
          actionName: 'modifyLine',
          pointIndex: 0,
          }), 
        p2: new fabric.Control({
            positionHandler: linePositionHandler,
            actionHandler: lineActionHandler,
            actionName: 'modifyLine',
            pointIndex: 1,
          }),
        };
      this.canvas.add(line);
      this.activeLine = line;
    } else if (this.activeCircle) {
      this.activeCircle.setCoords();
      this.activeCircle = null;
      this.handleChange();
    } else if (this.isDrawingCircle) {
      this.activeCircle = new fabric.Ellipse({
        left: p.x,
        top: p.y,
        strokeWidth: this.state.strokeWidth,
        stroke: this.state.defaultColor,
        rx: 0,
        ry: 0,
        fill: 'transparent',
        evented: false,
      });
      this.activeCircle.originalCenter = {x: p.x, y: p.y};
      this.canvas.add(this.activeCircle);
      this.activeCircle.setCoords();
    } else if (this.activeRect) {
      this.activeRect.setCoords();
      this.activeRect = null;
      this.handleChange();
    } else if (this.isDrawingRect) {
      this.activeRect = new fabric.Rect({
        width: 0,
        height: 0,
        left: p.x,
        top: p.y,
        strokeWidth: this.state.strokeWidth,
        stroke: this.state.defaultColor,
        fill: 'transparent',
        evented: false,
      });
      this.activeRect.originalCorner = {x: p.x, y: p.y};
      this.canvas.add(this.activeRect);
    } else if (this.isAddingText) {
      this.canvas.add(this.newTextBox(p.x, p.y));
      this.isAddingText = false;
    }
  }

  newTextBox(x, y) {
    return new fabric.Textbox('text', {
      fontSize: 20,
      left: x,
      top: y,
      fontFamily: 'Source Sans Pro',
      charSpacing: 30,
      angle: 0,
      stroke: this.state.defaultColor,
      fill: this.state.defaultColor,
      fontWeight: '',
      originX: 'left',
      width: 100,
      hasRotatingPoint: true,
      centerTransform: true
    })
  }

  handleMouseMove(event) {
    const p = this.canvas.getPointer(event.e);    
    if (this.activeLine) {
      const theta = Math.atan2(this.activeLine.y1 - p.y, p.x - this.activeLine.x1);
      const shift = 0.5 * this.activeLine.strokeWidth;
      const adjustment = {x: 0, y: 0};
      // let adjustment;
      // if (0 < theta && theta < Math.PI/2) {
      //   adjustment = {
      //     x: shift*Math.cos(theta + Math.PI/2) - shift*Math.cos(theta)*Math.cos(theta),
      //     y: shift*Math.sin(theta + Math.PI/2) - shift*Math.cos(theta)*Math.sin(theta), 
      //   }
      // } else if (Math.PI/2 < theta && theta < Math.PI) {
      //   console.log('Q2')
      //   adjustment = {
      //     x: -shift*Math.cos(theta)*Math.cos(theta + Math.PI/2) - shift*Math.cos(theta),
      //     y: -shift*Math.cos(theta)*Math.cos(theta + Math.PI/2) - shift*Math.cos(theta),
      //   }
      // } else {
      //   adjustment = {
      //     x: 0,
      //     y: 0,
      //   }
      // }
      this.activeLine.set({
        x2: p.x + adjustment.x,
        y2: p.y - adjustment.y,
      });
      this.canvas.requestRenderAll();
    } else if (this.activeCircle) {
      const {x: a, y: b} = this.activeCircle.originalCenter;
      const { x, y } = p;
      const r = Math.hypot(x - a, y - b);
      this.activeCircle.set({
        left: a - r,
        top: b - r,
        rx: r,
        ry: r,
      });
      this.canvas.requestRenderAll();
    } else if (this.activeRect) {
      this.activeRect.set({
        left: Math.min(this.activeRect.originalCorner.x, p.x),
        top: Math.min(this.activeRect.originalCorner.y, p.y),
        width: Math.abs(this.activeRect.originalCorner.x - p.x),
        height: Math.abs(this.activeRect.originalCorner.y - p.y),
      });
      this.canvas.requestRenderAll();
    }
  }

  handleCopy(event) {
    if (!document.activeElement.classList.contains('ql-editor')) {
      this.canvas.getActiveObject().clone((cloned) => {
        this.clipboard = cloned;
      });
      event.preventDefault();
    }
  }

  handlePaste(event) {
    if (this.clipboard && !document.activeElement.classList.contains('ql-clipboard')) {
      this.clipboard.clone((clonedObj) => {
        this.canvas.discardActiveObject();
        clonedObj.set({
          left: clonedObj.left + 10,
          top: clonedObj.top + 10,
          evented: true,
        });
        if (clonedObj.type === 'activeSelection') {
          // active selection needs a reference to the canvas.
          clonedObj.canvas = this.canvas;
          clonedObj.forEachObject((obj) => {
            this.canvas.add(obj);
          });
          clonedObj.setCoords();
        } else {
          this.canvas.add(clonedObj);
        }
        this.clipboard.top += 10;
        this.clipboard.left += 10;
        this.canvas.setActiveObject(clonedObj);
        this.canvas.requestRenderAll();
      });
      event.preventDefault();
    }
  }

  undo(increment = -1) {
    this.undoing = true;
    if (0 < this.snapshotPosition && increment === -1 ) this.snapshotPosition -= 1;
    if (this.snapshotPosition < this.snapshots.length - 1 && increment === 1 ) this.snapshotPosition += 1;
    const snapshot = this.snapshots[this.snapshotPosition];
    this.canvas.loadFromJSON(snapshot, this.canvas.renderAll.bind(this.canvas));
    setTimeout( () => this.undoing = false, 50 );
  }

  toJson() {
    return {
      fabricJson: JSON.stringify(this.canvas.toJSON()),
      fabricCode: this.state.fabricCode,
    };
  }

  componentWillUnmount() {
    if (this.props.saveFabric) {
      this.props.saveFabric(this.toJson());
    } else {
      localStorage.setItem('prismia-drawing', JSON.stringify(this.toJson()));
    }
    Mousetrap.unbind('mod+z');
    Mousetrap.unbind('mod+shift+z');
    Mousetrap.unbind('shift+p');
    Mousetrap.unbind('shift+d');
    Mousetrap.unbind('shift+r');    
    Mousetrap.unbind('shift+l');
    Mousetrap.unbind('shift+c');
    Mousetrap.unbind('shift+s');
    Mousetrap.unbind('shift+f');
    Mousetrap.unbind('esc');
    window.removeEventListener('copy', this.handleCopy);
    window.removeEventListener('paste', this.handlePaste);
  }

  handleChange() {
    if (this.undoing) return;
    this.setState({justCleared: false}, () => {
      this.snapshots = this.snapshots.slice(0, this.snapshotPosition + 1);
      this.snapshots.push(this.canvas.toJSON());
      const n = this.snapshots.length;
      if (n > 50) {
        this.snapshots = this.snapshots.slice(n - 40, n);
      }
      this.snapshotPosition = this.snapshots.length - 1;  
    });
  }

  handleRender({rebound=false}={}) {
    if (rebound && !this.rebound) return;
    const throttleTime = this.props.throttleTime || 8000;
    const now = new Date()
    if (now - this.lastUpdate < throttleTime) {
      setTimeout(() => this.handleRender({rebound: true}), throttleTime + 50);
      this.rebound = true;
      return;
    };
    if (this.canvas.getObjects().length || this.props.getEmptyCanvas ) {
      this.sanitize(this.canvas.toSVG()).then(svg => {
        this.props.setTyping({ svg: this.props.rawSvg ? svg : btoa(svg), isEmpty: false });
        this.lastUpdate = now;
        this.rebound = false;
      }).catch(console.error);
    } else {
      this.props.setTyping({ svg: "", isEmpty: true });
    }
  }

  setOverlayImage(url) {
    //this.canvas.setBackgroundImage(url, this.canvas.renderAll.bind(this.canvas));
    fabric.Image.fromURL(url, (img) => {
      const { width: W, height: H } = this.canvas;
      const { width: w, height: h } = img;
      const scaleFactor = Math.min(0.95*W/w, 0.95*H/h);
      this.canvas.add(img.scale(scaleFactor));
      img.center();
      this.canvas.renderAll();
    });
  }

  componentDidUpdate(prevProps) {
    if (this.props.watermarkUrl && this.props.watermarkUrl !== prevProps.watermarkUrl) {
      this.setOverlayImage(this.props.watermarkUrl);
    }
    if (this.props.parentRef?.current?.clientWidth && 
            this.props.parentRef.current.clientWidth !== this.canvas.width) {
      this.canvas.setWidth(this.props.parentRef.current.clientWidth);
    }
  }

  editPolygon () {
    // clone what are you copying since you
    // may want copy and paste on different moment.
    // and you do not want the changes happened
    // later to reflect on the copy.
    var poly = this.canvas.getActiveObjects()[0]; // TO DO
    poly.edit = !poly.edit;
    if (poly.edit) {
      var lastControl = poly.points.length - 1;
      poly.cornerStyle = 'circle';
      poly.cornerColor = 'rgba(0,0,255,0.5)';
      poly.controls = poly.points.reduce(function(acc, point, index) {
        acc['p' + index] = new fabric.Control({
          positionHandler: polygonPositionHandler,
          actionHandler: anchorWrapper(index > 0 ? index - 1 : lastControl, polygonActionHandler),
          actionName: 'modifyPolygon',
          pointIndex: index
        });
        return acc;
      }, { });
    } else {
      poly.cornerColor = 'blue';
      poly.cornerStyle = 'rect';
      poly.controls = fabric.Object.prototype.controls;
    }
    poly.hasBorders = !poly.edit;
    poly.setCoords();
    this.canvas.requestRenderAll();
  }

  editLine () {
    // clone what are you copying since you
    // may want copy and paste on different moment.
    // and you do not want the changes happened
    // later to reflect on the copy.
    var poly = this.canvas.getActiveObjects()[0]; // TO DO
    poly.edit = !poly.edit;
    if (poly.edit) {
      var lastControl = poly.points.length - 1;
      poly.cornerStyle = 'circle';
      poly.cornerColor = 'rgba(0,0,255,0.5)';
      poly.controls = poly.points.reduce(function(acc, point, index) {
        acc['p' + index] = new fabric.Control({
          positionHandler: polygonPositionHandler,
          actionHandler: anchorWrapper(index > 0 ? index - 1 : lastControl, polygonActionHandler),
          actionName: 'modifyPolygon',
          pointIndex: index
        });
        return acc;
      }, { });
    } else {
      poly.cornerColor = 'blue';
      poly.cornerStyle = 'rect';
      poly.controls = fabric.Object.prototype.controls;
    }
    poly.hasBorders = !poly.edit;
    this.canvas.requestRenderAll();
  }
  
  addLine({arrow=false}={}) {
    this.isDrawingLine = !this.isDrawingLine || (this.addArrowHead !== arrow);
    this.setCanvasSelection(!this.isDrawingLine);
    this.addArrowHead = arrow;
  }

  addArrow(line, p) {
    const { x1, y1 } = line;
    const { x: x2, y: y2} = p;
    const phi = 0.35; // radians
    const arrowsize = Math.max(5, 6 * line.strokeWidth);
    const theta = Math.atan2(y1 - y2, x2 - x1);
    const thetaReal = Math.atan2(y1 - line.y2, line.x2 - x1);
    const triangleVertices = [{
      x: x2, 
      y: y2,
    }, {
      x: x2 + arrowsize*Math.cos(theta + Math.PI - phi),
      y: y2 - arrowsize*Math.sin(theta + Math.PI - phi),
    }, {
      x: x2 + arrowsize*Math.cos(theta + Math.PI + phi),
      y: y2 - arrowsize*Math.sin(theta + Math.PI + phi),
    }]
    const arrowHead = new fabric.Polygon(triangleVertices, {
      top: Math.min(...triangleVertices.map(p => p.y)),
      left: Math.min(...triangleVertices.map(p => p.x)),
      fill: this.state.defaultColor,
    });
    line.set({
      x2: line.x2 - 0.5*arrowsize*Math.cos(thetaReal), 
      y2: line.y2 + 0.5*arrowsize*Math.sin(thetaReal),
    });
    const objs = [line, arrowHead];
    var arrowObj = new fabric.Group(objs);
    this.canvas.remove(line);
    this.canvas.add(arrowObj);
  }

  addArrowOld() {
    this.closeActiveTools();
    const triangle = new fabric.Triangle({
      width: 10, 
      height: 15, 
      fill: this.state.defaultColor,
      left: 235, 
      top: 65,
      angle: 90,
    });

    const line = new fabric.Line([50, 100, 200, 100], {
      left: 75,
      top: 69,
      stroke: this.state.defaultColor,
      strokeWidth: 3,
    });

    const objs = [line, triangle];
    var arrowObj = new fabric.Group(objs);
    this.canvas.add(arrowObj);
  }

  addPolygon(numSides=3) {
    this.closeActiveTools();
    const polygon = new fabric.Polygon(regularPolygon(numSides), {
      left: 100,
      top: 100,
      fill: 'transparent',
      strokeWidth: this.state.strokeWidth,
      stroke: this.state.defaultColor,
      strokeLineJoin: 'round',
      objectCaching: false,
      cornerColor: 'blue',
      perPixelTargetFind: true,
    });
    this.canvas.add(polygon);
    this.canvas.setActiveObject(polygon);
    this.editPolygon(); 
  }

  addRectangle() {
    const isDrawingRect = this.isDrawingRect;
    this.closeActiveTools();
    this.isDrawingRect = !isDrawingRect;
    this.setCanvasSelection(!this.isDrawingRect);
  }

  clear() {
    const activeObjects = this.canvas.getActiveObjects();
    if (activeObjects.length === 0) {
      this.canvas.clear();
      setTimeout(() => this.setState({ justCleared: true }), 30);
    } else {
      for (let obj of this.canvas.getActiveObjects()) {
        this.canvas.remove(obj);
      }
    }
    this.handleChange();
  }

  addTextBox() {
    let somethingHandled = false;
    this.canvas.getActiveObjects().forEach(obj => {
      if (obj.latexSource) {
        this.canvas.remove(obj);
        this.canvas.add(this.newTextBox(obj.left, obj.top));
        somethingHandled = true;
        return;
      }
      const text = obj.get('text');
      if (!text) return;
      somethingHandled = true;
      try {
        compileLaTeX(text, (svg, width, height) => {
          fabric.Image.fromURL(svg, (img) => {
            img.height = height;
            img.width = width;
            img.top = obj.top;
            img.left = obj.left;
            img.latexSource = text;
            this.canvas.remove(obj);
            this.canvas.add(img);
          });
        }, {color: this.state.defaultColor });
      } catch (error) {
        console.log(error);
      }
    });
    if (somethingHandled) return;
    const isAddingText = this.isAddingText;
    this.closeActiveTools();
    this.isAddingText = !isAddingText;
  }

  addCircle() {
    const isDrawingCircle = this.isDrawingCircle; 
    this.closeActiveTools();
    this.isDrawingCircle = !isDrawingCircle;
    this.setCanvasSelection(!this.isDrawingCircle);
  }

  setCanvasSelection(setting) {
    this.canvas.getObjects().forEach(obj => obj.set('evented', setting));
  }

  closeActiveTools() {
    this.isDrawingLine = false;
    this.isDrawingCircle = false;
    this.isDrawingRect = false;
    this.isAddingText = false;
    this.canvas.isDrawingMode = false;
    this.setState({ isDrawingMode: false });
  }

  toggleFreeDrawingMode() {
    const { isDrawingMode } = this.state;
    this.closeActiveTools();
    this.canvas.freeDrawingBrush.width = this.state.strokeWidth;
    this.setState({ isDrawingMode: !isDrawingMode});
    this.canvas.isDrawingMode = !isDrawingMode;
  }

  applyToActive(func) {
    const activeObjects = this.canvas.getActiveObjects();
    if (activeObjects.length === 0) return;
    for (let obj of activeObjects) {
      if (obj.get('type') === 'group') {
        for (let i = 0; i < obj.size(); i++) {
          func(obj.item(i));
        }
      } else {
        func(obj);
      }
    }
    this.canvas.renderAll();
  }

  sendBackwards() {
    this.applyToActive(obj => this.canvas.sendBackwards(obj));
    this.canvas.discardActiveObject().renderAll();
  }

  bringForward() {
    this.applyToActive(obj => this.canvas.bringForward(obj));
    this.canvas.discardActiveObject().renderAll();
  }

  setColor(color) {
    if (color in palette) color = palette[color];
    this.setState({ defaultColor: color });
    this.canvas.freeDrawingBrush.color = color;
    if (this.state.strokeFill) {
      this.applyToActive(object => object.set({[this.state.strokeFill]: color}));
    }
    this.applyToActive(object => {
      if (!object.latexSource) return;
      console.log(JSON.parse(JSON.stringify(object)));
      try {
        compileLaTeX(object.latexSource, (svg, width, height) => {
          fabric.Image.fromURL(svg, (img) => {
            img.height = height;
            img.width = width;
            img.top = object.top;
            img.left = object.left;
            img.scaleX = object.scaleX;
            img.scaleY = object.scaleY;
            img.angle = object.angle;
            img.latexSource = object.latexSource;
            this.canvas.remove(object);
            this.canvas.add(img);
          });
        }, { color });
      } catch (e) {
        console.log(e);
      }
    });
    this.handleChange();
  }
  
  runCode() {
    const { fabricCode } = this.state;
    window['canvas-' + this.id] = this.canvas;
    window['fabric-' + this.id] = fabric;
    // eslint-disable-next-line
    eval(
      fabricCode
        .replaceAll('canvas', `window['canvas-${this.id}']`)
        .replaceAll('fabric', `window['fabric-${this.id}']`)
    );
    this.closeActiveTools();
    this.handleChange();
  }

  handlePolygonClick(event) {
    const activeObjects = this.canvas.getActiveObjects();
    if (activeObjects.length === 1 && activeObjects[0].get('type') === 'polygon') {
      this.editPolygon();
    } else {
      this.openMenu(event);
    }
  }

  adjustStrokeWidth(strokeWidth) {
    this.applyToActive(obj => obj.set('strokeWidth', strokeWidth));
  }

  handleStrokeWidthChange(strokeWidth) {
    this.setState({strokeWidth});
    this.adjustStrokeWidth(strokeWidth);
  }

  // Grouping doesn't work right now, apparently for reasons having to do with 
  // offsetting transformations

//   handleGroup() {
//     const activeObjects = this.canvas.getActiveObjects();
//     if (activeObjects.length === 1 && activeObjects[0].get('type') === 'group') {
//       const group = activeObjects[0];
//       group.forEachObject((i) => {
//         group.removeWithUpdate(i);
//         this.canvas.add(i);
//       });
//       group.set('dirty', true);
//       this.canvas.renderAll();
//     } else {
//       const group = new fabric.Group([...activeObjects]);
//       activeObjects.forEach(item => {
// //        this.canvas.remove(item);
//       });
//       this.canvas.add(group);
//       this.canvas.renderAll();
//     }
//   }

//   <Tooltip title="group/ungroup" enterDelay={ 500 }>
//   <Button
//     style={{minWidth: 0, padding: "13px", marginRight: "-10px"}}
//     className="insert-drawing-button"
//     onClick={ () => this.handleGroup() }>
//     <GroupWorkIcon
//       style={ {color: "#777"} }
//       />
//   </Button>
// </Tooltip>

  render() {
    const width = this.props.parentRef?.current?.clientWidth || this.props.width || 825;
    const height = this.props.height ? this.props.height : 400;
    return (<>
      <div style={{
        height: height,
        width: width,
        marginLeft: "auto", 
        marginRight: "auto"}}>
        <canvas 
          width={ width }
          height={ height }
          id={ this.id }>
        </canvas>
      </div>
      <div className="fabric-buttons">
      { this.props.saveSketch ? <Button
        style={{margin: "10px", marginRight: "12px"}}
        variant="contained"
        color="primary"
        size="small"
        className="insert-drawing-button fabric-button"
        onClick={ () => {
          this.sanitize(this.canvas.toSVG())
            .then(svg => this.props.saveSketch(svg))
            .catch(console.error);
          if (this.props.saveFabric) {
            this.props.saveFabric(this.toJson());
          }
        }}>
        Insert
      </Button> : null }
      <Tooltip title="draw freehand [shift + p]" enterDelay={ 500 }>
        <Button
          style={{minWidth: 0, padding: "13px", marginRight: "-10px"}}
          className="insert-drawing-button"
          onClick={ () => this.toggleFreeDrawingMode() }>
          { this.state.isDrawingMode ? <CreateIcon
            style={ {color: "#777"} }
            /> : <CreateOutlinedIcon
            style={ {color: "#777"} }
            />}
        </Button>
      </Tooltip>
      <Tooltip title="insert text or compile TeX [shift t]" enterDelay={ 500 }>
        <Button
          style={{minWidth: 0, padding: "13px", marginRight: "-10px"}}
          className="insert-drawing-button"
          onClick={ () => this.addTextBox() }>
          <TextFieldsIcon
            style={ {color: "#777"} }
            />
        </Button>
      </Tooltip>
      {/* <Tooltip title="insert arrow" enterDelay={ 500 }>
        <Button
          style={{minWidth: 0, padding: "13px", marginRight: "-10px"}}
          className="insert-drawing-button"
          onClick={ () => this.addLine({arrow: true}) }>
          <ArrowRightAltOutlinedIcon
            style={ {color: "#777"} }
            />
        </Button>
      </Tooltip> */}
      <Tooltip title="insert line [shift l]" enterDelay={ 500 }>
        <Button
          style={{minWidth: 0, padding: "13px", marginRight: "-10px"}}
          className="insert-drawing-button"
          onClick={ () => this.addLine() }>
          <RemoveIcon
            style={ {color: "#777"} }
            />
        </Button>
      </Tooltip>
      <Tooltip title="insert circle [shift c]" enterDelay={ 500 }>
        <Button
          style={{minWidth: 0, padding: "13px", marginRight: "-10px"}}
          className="insert-drawing-button"
          onClick={ () => this.addCircle() }>
          <RadioButtonUncheckedIcon
            style={ {color: "#777"} }
            />
        </Button>
      </Tooltip>
      <Tooltip title="insert rectangle [shift r]" enterDelay={ 500 }>
        <Button
          style={{minWidth: 0, padding: "13px", marginRight: "-10px"}}
          className="insert-drawing-button"
          onClick={ () => this.addRectangle() }>
          <CropSquareIcon
            style={ {color: "#777"} }
            />
        </Button>
      </Tooltip>
      <Tooltip title="add/edit polygon" enterDelay={ 500 }>
        <Button
          style={{minWidth: 0, padding: "13px", marginRight: "-10px"}}
          className="insert-drawing-button"
          onClick={ (e) => this.handlePolygonClick(e) }>
          <svg className="MuiSvgIcon-root" focusable="false" viewBox="0 0 24 24" aria-hidden="true" style={{color: "rgb(119, 119, 119)", transform: "translate(0,-0.04em)"}}><path d="M 10.831457,7.0484273 C 8.1589813,10.975571 6.5818716,13.209816 4.1315068,16.915068 3.3060287,18.18874 3.203655,20 5.6187235,20 H 18.554584 c 1.79323,0 2.617955,-1.206031 1.688048,-2.727892 C 18.265871,14.036993 16.665029,11.540241 13.899575,7.1091681 12.484019,4.841029 11.866198,5.7128405 10.831457,7.0484251 Z M 18,18 H 6 c 2.6431552,-4.076211 2.6693399,-4.03928 6.280852,-9.1577569 z"></path></svg>
        </Button>
      </Tooltip>
      <Tooltip title="bring to front" enterDelay={ 500 }>
        <Button
          style={{minWidth: 0, padding: "13px", marginRight: "-10px"}}
          className="insert-drawing-button"
          onClick={ () => this.bringForward() }>
          <FlipToFrontIcon
            style={ {color: "#777"} }
            />
        </Button>
      </Tooltip>
      <Tooltip title="push to back" enterDelay={ 500 }>
        <Button
          style={{minWidth: 0, padding: "13px", marginRight: "-10px"}}
          className="insert-drawing-button"
          onClick={ () => this.sendBackwards() }>
          <FlipToBackIcon
            style={ {color: "#777"} }
            />
        </Button>
      </Tooltip>
      <Tooltip title="open code editor" enterDelay={ 500 }>
        <Button
          style={{minWidth: 0, padding: "13px", marginRight: "-10px"}}
          className="insert-drawing-button"
          onClick={ (event) => this.openEditor(event) }>
          <CodeIcon
            style={ {color: "#777"} }
            />
        </Button>
      </Tooltip>
      {/* <Popover
        open={Boolean(this.state.editorOpenRef)}
        anchorEl={this.state.editorOpenRef}
        onClose={() => this.closeEditor() }
        PaperProps={{
          style: { width: '400px' },
        }}
        anchorOrigin={{
          vertical: 'top',
          horizontal: 'left',
        }}
        transformOrigin={{
          vertical: 'bottom',
          horizontal: 'left',
        }}>
        <div className='y-scrollable' style={{maxHeight: "400px", position: 'relative'}}>
          <Editor
            className="jessiecode-editor"
            highlight={ code => highlight(code, languages.js)}
            value={ this.state.fabricCode }
            onValueChange={ code => this.setState({ fabricCode: code })}
            padding={10}
            style={{
              fontFamily: '"Menlo", "Monaco", "Fira code", "Fira Mono", monospace',
              fontSize: 14,
              marginTop: 0,
            }}/>
          <Button 
              style={{position: 'absolute', top: '10px', right: '10px', color: 'white'}}
              onClick={ () => this.runCode() }>
                run
          </Button>
        </div>
      </Popover> */}
      <Menu
        open={ Boolean(this.state.menuOpenRef) }
        anchorEl={ this.state.menuOpenRef }
        onClose={ () => this.handleClose() }>
        { [3, 4, 5, 6, 7, 8].map(numSides => {
          return (
            <MenuItem
              key={'polygon-' + numSides}
              onClick={ () => this.addPolygon(numSides) }>
              { numSides }
            </MenuItem>
          );
        }) }
      </Menu>
      <Tooltip title={this.state.justCleared ? "undo [cmd z]" : "delete [shift d]"} enterDelay={ 500 }>
        <Button
          style={{minWidth: 0, padding: "13px", marginRight: "-10px"}}
          onClick={ () => this.clear() }>
          <DeleteIcon
            style={ {color: "#c7260b"} }
            />
        </Button>
      </Tooltip>
      { this.props.watermarkUrl ? <Tooltip title="insert background image" enterDelay={ 500 }>
        <Button
          style={{minWidth: 0, padding: "13px"}}
          onClick={ () => {
            this.setOverlayImage(this.props.watermarkUrl);
          } }>
          <ImageIcon
            style={ {color: "#7a80a0"} }
            />
        </Button>
      </Tooltip> : null }
      <Tooltip title="undo [cmd z]" enterDelay={ 500 }>
        <Button
          style={{minWidth: 0, padding: "13px", marginRight: "-10px"}}
          onClick={ () => this.undo() }>
            <UndoIcon style={ {color: "#777"} }/>
        </Button>
      </Tooltip>
      <div className="fabric-palette-container">
        <div className="fabric-color-palette">
          { Object.keys(palette).map( name => 
            <Button 
              key={name} 
              id={name + '-button'}
              style={{ 
                background: palette[name], 
                width: "4px", 
                height: "3px", 
                minWidth: "4px",
                border: '0.5px solid gray',
              }} 
              onClick={() => this.setColor(name)}>
            </Button>
          ) }
          <Button style={{ 
            background: this.state.pickerColor ? '#' + this.state.pickerColor.hex : 'linear-gradient(to left, teal, green, yellow, orange, red)',
            width: "4px", 
            height: "3px", 
            minWidth: "4px",
            border: '0.5px solid gray',
          }} onClick={(event) => this.openPicker(event)}/>
          <Popover
            open={Boolean(this.state.pickerOpenRef)}
            anchorEl={this.state.pickerOpenRef}
            onClose={() => this.closePicker() }
            PaperProps={{
              style: { padding: '10px 15px 5px 15px' },
            }}
            anchorOrigin={{
              vertical: 'top',
              horizontal: 'left',
            }}
            transformOrigin={{
              vertical: 'bottom',
              horizontal: 'left',
            }}>
            <ColorBox
              value={this.state.pickerColor} 
              hideTextfield
              defaultValue='#555' 
              onChange={color => {
                this.setState({pickerColor: color}); 
                this.setColor('#' + color.hex);
              }}/>
            </Popover>
        </div>
      </div>
      <Tooltip title="stroke/fill" enterDelay={ 500 }>
        <Button
          style={{minWidth: 0, padding: "13px", marginRight: "-10px"}}
          onClick={ () => this.setState({ strokeFill: this.state.strokeFill === 'stroke' ? 'fill' : (this.state.strokeFill === 'fill' ? null : 'stroke')}) }>
          { this.state.strokeFill === 'stroke' ? <FavoriteBorderOutlinedIcon
            style={ {color: "#777"} }
            /> : (this.state.strokeFill === 'fill' ? <FavoriteOutlinedIcon
            style={ {color: "#777"} }
          /> : <svg className="MuiSvgIcon-root" focusable="false" viewBox="0 0 24 24" aria-hidden="true" 
            style={{color: "rgb(119, 119, 119)"}}><path
          d="M 10.099203,3 C 9.1272991,3 8.1944942,3.4596803 7.5856573,4.1860887 6.9768207,3.4596803 6.0440159,3 5.0721115,3 3.3517291,3 2,4.3733658 2,6.121286 c 0,2.1451747 1.8991235,3.893095 4.775737,6.549026 l 0.8099203,0.743433 0.8099203,-0.749108 C 11.272191,10.014381 13.171314,8.2664607 13.171314,6.121286 13.171314,4.3733658 11.819585,3 10.099203,3 Z m -2.4576891,8.824727 -0.055857,0.05675 -0.055857,-0.05675 C 4.8710279,9.3787733 3.1171314,7.7613798 3.1171314,6.121286 c 0,-1.1350131 0.8378487,-1.9862729 1.9549801,-1.9862729 0.8601912,0 1.6980399,0.5618315 1.9940797,1.3393154 h 1.044518 c 0.2904537,-0.7774839 1.128303,-1.3393154 1.9884938,-1.3393154 1.117131,0 1.954981,0.8512598 1.954981,1.9862729 0,1.6400938 -1.753897,3.2574873 -4.4126701,5.703441 z"/>
       <path
          style={{color:"rgb(119, 119, 119)"}}
          d="m 18.981275,10.283167 c -0.980223,0 -1.921012,0.468122 -2.535059,1.20787 -0.614048,-0.739748 -1.554837,-1.20787 -2.53506,-1.20787 -1.735108,0 -3.098407,1.398586 -3.098407,3.178605 0,2.184568 1.915379,3.964586 4.816614,6.669289 l 0.816853,0.757086 0.816852,-0.762865 c 2.901235,-2.698924 4.816613,-4.478942 4.816613,-6.66351 0,-1.780019 -1.363299,-3.178605 -3.098406,-3.178605 z" /></svg>) }
        </Button>
      </Tooltip>
      <Tooltip title="stroke width" enterDelay={ 500 }>
        <Button
          style={{minWidth: 0, padding: "13px", marginRight: "-10px"}}
          onClick={ (event) => this.openSlider(event) }>
            <svg className="MuiSvgIcon-root" focusable="false" viewBox="0 0 24 24" aria-hidden="true" style={{color: "rgb(119, 119, 119)"}}><path d="M 2.9964082,17.981122 20.984714,18 21.003592,15.328094 2.9964082,15.295312 Z M 3.0389985,7.2479518 3,8.5849774 h 18 l -0.039,-1.2980271 z m -0.045056,5.7396772 17.9900371,-0.02051 0.0039,-1.934246 -17.9815665,-0.02051 "></path></svg>
        </Button>
      </Tooltip>
      <Popover
        open={Boolean(this.state.sliderOpenRef)}
        anchorEl={this.state.sliderOpenRef}
        onClose={() => this.closeSlider() }
        PaperProps={{
          style: { width: '160px', padding: '10px 15px 5px 15px' },
        }}
        anchorOrigin={{
          vertical: 'top',
          horizontal: 'left',
        }}
        transformOrigin={{
          vertical: 'bottom',
          horizontal: 'left',
        }}>
        <Slider 
          value={this.state.strokeWidth} 
          min={0.5}
          max={20}
          step={0.01}
          onChange={(event, strokeWidth) => this.handleStrokeWidthChange(strokeWidth)}
          onChangeCommitted={() => this.handleChange()}
          aria-labelledby="stroke width" />
      </Popover>
    </div>
    </>
    );
  }
}

export default DrawingTool;