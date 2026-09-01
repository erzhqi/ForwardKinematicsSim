import matplotlib.pyplot as plt
import numpy as np
from matplotlib.widgets import Slider

slide = plt.axes([0.1, 0.1, 0.8, 0.05], facecolor="teal")

slider = Slider(slide, "Bald", valmin=0, valmax=90, valinit=0, valstep=1)

plt.show()
