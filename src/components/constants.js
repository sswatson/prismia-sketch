export const fabricStarterCode = `canvas.clear()

// add a circle
canvas.add(new fabric.Circle({
  left: 100,
  top: 175,
  radius: 50,
  fill: 'orange',
}))

// add a grid of rectangles:
for (let i = 0; i < 10; i++) {
  for (let j = 0; j < 10; j++) {
    canvas.add(new fabric.Rect({
      left: 280 + 20*i,
      top: 125 + 20*j,
      width: 10,
      height: 10,
      fill: 'teal',
    }))
  }
}

// add a line (coordinates are 
// [x1, y1, x2, y2] )
canvas.add(new fabric.Line(
  [550, 200, 675, 325], {
  stroke: 'gray',
  strokeWidth: 3,
}))

canvas.add(new fabric.Textbox('Welcome!', {
  fontSize: 24,
  left: 565,
  top: 150,
  fontFamily: 'Source Sans Pro',
  fill: 'gray',
  originX: 'left',
  originY: 'bottom',
}))`;
