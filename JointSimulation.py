import matplotlib.pyplot as plt
from matplotlib.widgets import Slider
import math

fig = plt.figure(figsize=(7,7))
ax = fig.add_subplot(1, 1, 1)
fig.subplots_adjust(left=0.12, right=0.95, bottom=0.18, top=0.90)

fig.subplots_adjust(
    left=0.10,
    right=0.95,
    bottom=0.15,
    top=0.95,
)

ax.set_title("2 DOF FK Simulator")
ax.set_xlim(-5, 5)
ax.set_ylim(-5, 5)
ax.set_xticks(range(-5, 6))
ax.set_yticks(range(-5, 6))
ax.grid(True)
ax.plot([-5, 5], [0, 0], color="gray")
ax.plot([0, 0], [-5, 5], color="gray")

basePointx = 0
basePointy = 0

degreeOnex = 1
degreeOney = 2

degreeTwox = 2
degreeTwoy = 2

lengthLink1 = ((degreeOnex)**2 + (degreeOney)**2)**0.5
lengthLink2 = ((degreeTwox - degreeOnex)**2 + (degreeTwoy - degreeTwoy)**2)**0.5

basePoint, = ax.plot([basePointx], [basePointy], marker="o")
degreeOne, = ax.plot([degreeOnex], [degreeOney], marker="o")
degreeTwo, = ax.plot([degreeTwox], [degreeTwoy], marker="o")

baseOneLine, = ax.plot([basePointx, degreeOnex], [basePointy, degreeOney], color="mistyrose")
baseTwoLine, = ax.plot([degreeOnex, degreeTwox], [degreeOney, degreeTwoy], color="mistyrose")

sliderOneInitial = math.atan(2) * (180/math.pi)

slideOne = plt.axes([0.12, 0.06, 0.8, 0.05], facecolor="teal")
sliderOne = Slider(slideOne, "Angle 1", valmin=-180, valmax=180, valinit=sliderOneInitial, valstep=1)

slideTwo = plt.axes([0.12, 0.03, 0.8, 0.05], facecolor="teal")
sliderTwo = Slider(slideTwo, "Angle 2", valmin=-180, valmax=180, valinit=-sliderOneInitial, valstep=1)

def update(val):
    angle1 = sliderOne.val
    angle2 = sliderTwo.val

    angle1 = math.radians(angle1)
    angle2 = math.radians(angle2)

    degreeOnex = lengthLink1 * math.cos(angle1)
    degreeOney = lengthLink1 * math.sin(angle1)
    degreeTwox = degreeOnex + lengthLink2 * math.cos(angle1 + angle2)
    degreeTwoy = degreeOney + lengthLink2 * math.sin(angle1 + angle2)

    degreeOne.set_xdata([degreeOnex])
    degreeOne.set_ydata([degreeOney])
    degreeTwo.set_xdata([degreeTwox])
    degreeTwo.set_ydata([degreeTwoy])

    baseOneLine.set_xdata([basePointx, degreeOnex])
    baseOneLine.set_ydata([basePointy, degreeOney])
    baseTwoLine.set_xdata([degreeOnex, degreeTwox])
    baseTwoLine.set_ydata([degreeOney, degreeTwoy])
    fig.canvas.draw_idle()

sliderOne.on_changed(update)
sliderTwo.on_changed(update)
plt.show()
