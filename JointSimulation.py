import matplotlib.pyplot as plt
import numpy as np
from matplotlib.widgets import Slider

fig = plt.figure(figsize=(6,6))
ax = fig.add_subplot(1, 1, 1)
fig.subplots_adjust(left=0.12, right=0.95, bottom=0.18, top=0.90)

fig.subplots_adjust(
    left=0.10,
    right=0.95,
    bottom=0.15,
    top=0.9,
)
ax.set_title("2 DOF FK Simulator")
ax.set_xlim(-4, 4)
ax.set_ylim(-4, 4)
ax.set_xticks(range(-4, 5))
ax.set_yticks(range(-4, 5))
ax.grid(True)
ax.plot([-4, 5], [0, 0], color="gray")
ax.plot([0, 0], [-4, 5], color="gray")

basePoint, = ax.plot([0], [0], marker="o")
degreeOne, = ax.plot([1], [1], marker="o")


slide = plt.axes([0.1, 0.05, 0.8, 0.05], facecolor="teal")
slider = Slider(slide, "Bald", valmin=1, valmax=4, valinit=1, valstep=1)

def update(val):
    x_val = slider.val
    degreeOne.set_xdata([x_val])
    degreeOne.set_ydata([1])
    fig.canvas.draw_idle()
slider.on_changed(update)

plt.show()
