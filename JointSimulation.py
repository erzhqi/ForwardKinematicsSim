import matplotlib.pyplot as plt
from matplotlib.widgets import Slider
import numpy as np
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

ax.set_title("3 DOF FK Simulator")
ax.set_xlim(-3, 8)
ax.set_ylim(-3, 8)
ax.set_xticks(range(-3, 9))
ax.set_yticks(range(-3, 9))
ax.grid(True)
ax.plot([-3, 8], [0, 0], color="gray")
ax.plot([0, 0], [-3, 8], color="gray")

basePointx = 0
basePointy = 0

pointOnex = 1
pointOney = 3

pointTwox = 2.5
pointTwoy = 3.5

pointThreex = 3
pointThreey = 3

lengthLink1 = ((pointOnex)**2 + (pointOney)**2)**0.5
lengthLink2 = ((pointTwox - pointOnex)**2 + (pointTwoy - pointOney)**2)**0.5
lengthLink3 = ((pointThreex - pointTwox)**2 + (pointThreey - pointTwoy)**2)**0.5

basePoint, = ax.plot([basePointx], [basePointy], color="orchid", marker="o", ms=7)
pointOne, = ax.plot([pointOnex], [pointOney], color="orchid", marker="o", ms=7)
pointTwo, = ax.plot([pointTwox], [pointTwoy], color="orchid", marker="o", ms=7)
pointThree, = ax.plot([pointThreex], [pointThreey], color="orchid", marker="o", ms=7)

pointOneLine, = ax.plot([basePointx, pointOnex], [basePointy, pointOney], color="darksalmon", lw=3)
pointTwoLine, = ax.plot([pointOnex, pointTwox], [pointOney, pointTwoy], color="darksalmon", lw=3)
pointThreeLine, = ax.plot([pointTwox, pointThreex], [pointTwoy, pointThreey], color="darksalmon", lw=3)

sliderOneInitial = math.degrees(math.atan2(pointOney, pointOnex))
link2Initial = math.degrees(math.atan2(pointTwoy-pointOney, pointTwox-pointOnex))

sliderTwoInitial = link2Initial - sliderOneInitial

link3Initial = math.degrees(math.atan2(pointThreey-pointTwoy, pointThreex-pointTwox))
sliderThreeInitial = link3Initial - link2Initial

slideOne = plt.axes([0.12, 0.06, 0.8, 0.05], facecolor="teal")
sliderOne = Slider(slideOne, "Angle 1", valmin=-180, valmax=180, valinit=sliderOneInitial, valstep=1)

slideTwo = plt.axes([0.12, 0.03, 0.8, 0.05], facecolor="teal")
sliderTwo = Slider(slideTwo, "Angle 2", valmin=-180, valmax=180, valinit=sliderTwoInitial, valstep=1)

slideThree = plt.axes([0.12, 0.00, 0.8, 0.05], facecolor="teal")
sliderThree = Slider(slideThree, "Angle 3", valmin=-180, valmax=180, valinit=sliderThreeInitial, valstep=1)

def transform(angle, length):
    return np.array([
        [math.cos(angle), -math.sin(angle), length*math.cos(angle)],
        [math.sin(angle), math.cos(angle), length*math.sin(angle)],
        [0, 0, 1],
    ])

def update(val):
    angle1 = sliderOne.val
    angle2 = sliderTwo.val
    angle3 = sliderThree.val

    angle1 = math.radians(angle1)
    angle2 = math.radians(angle2)
    angle3 = math.radians(angle3)

    transform1 = transform(angle1, lengthLink1)
    transform2 = transform(angle2, lengthLink2)
    transform3 = transform(angle3, lengthLink3)

    joint1 = transform1 @ np.array([0, 0, 1])
    joint2 = transform1 @ transform2 @ np.array([0, 0, 1])
    joint3 = transform1 @ transform2 @transform3 @ np.array([0, 0, 1])

    pointOnex, pointOney = joint1[0], joint1[1]
    pointTwox, pointTwoy = joint2[0], joint2[1]
    pointThreex, pointThreey = joint3[0], joint3[1]

    pointOne.set_xdata([pointOnex])
    pointOne.set_ydata([pointOney])
    pointTwo.set_xdata([pointTwox])
    pointTwo.set_ydata([pointTwoy])
    pointThree.set_xdata([pointThreex])
    pointThree.set_ydata([pointThreey])

    pointOneLine.set_xdata([basePointx, pointOnex])
    pointOneLine.set_ydata([basePointy, pointOney])
    pointTwoLine.set_xdata([pointOnex, pointTwox])
    pointTwoLine.set_ydata([pointOney, pointTwoy])
    pointThreeLine.set_xdata([pointTwox, pointThreex])
    pointThreeLine.set_ydata([pointTwoy, pointThreey])
    fig.canvas.draw_idle()

sliderOne.on_changed(update)
sliderTwo.on_changed(update)
sliderThree.on_changed(update)
plt.show()
