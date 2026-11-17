#!/usr/bin/env python3
"""Sandpile Lab
============

This is the main file from which we run all the various routines in the
sandpile lab.

"""
import time
from pathlib import Path

import matplotlib
import numpy as np
import scipy as sp
import scipy.stats
from matplotlib import pyplot

from sandpile import SandPile

def example_plotting(output_dir):
    """Here are some example  [1, 3, 1],
       [plotting routines to get you started."""
    # First, we create an array of x values, and compute the corresponding y
    # values.
    x = np.linspace(-4 * np.pi, 4 * np.pi, 1000)
    y = np.sin(x) / x
    # We create the new figure with 1 subplot (the default), and store the
    # Figure and Axis object in `fig` and `ax` (allowing for their properties
    # to be changed).
    fig, ax = pyplot.subplots()
    ax.plot(x, y)
    ax.set_title("Plot of sin(x) / x")
    ax.set_xlabel("x")
    ax.set_ylabel("y")
    # Matplotlib by default does a good job of figuring out the limits of the
    # axes; however, it can fail sometimes.  This allows you to set them
    # manually.
    ax.set_ylim([-0.5, 1.1])
    fig.savefig("output/example.pdf")
    pyplot.close(fig)

    # Now for the histogram.  We generate some random data
    data = np.random.randn(1000000)
    fig, ax = pyplot.subplots()
    ax.hist(data)
    ax.set_title("Histogram of random data")
    ax.set_xlabel("Value")
    ax.set_ylabel("Frequency")
    fig.savefig("output/example_histogram.pdf")
    pyplot.close(fig)

    # In this lab, you'll also want to show what the grid looks like.  This can
    # be done with `imshow`.
    data = np.array([[0, 1, 2], [3, 4, 5], [6, 7, 8]])
    fig, ax = pyplot.subplots()
    ax.imshow(data)
    ax.set_title("Grid plot")
    fig.savefig("output/example_grid.pdf")
    pyplot.close(fig)
    
def create_grid(arr, filename, title):
    """Create a grid plot of the given 2D array. 

        Parameters
        ==========

        arr: 2D array

            2D array representing the sandpile. Function will plot this array as a 2D grid.
        
        filename: str
        
            Filename for the grid plot.
        
        title: str
            
            Title for the grid plot.
            
    """
    data = arr
    fig, ax = pyplot.subplots()
    ax.imshow(data)
    ax.set_title(title)
    fig.savefig("Grids/" + filename)
    pyplot.close(fig)
    
    
def plotting(data, labels, plot_type, filename, num_bins=None, grid_length=None, show_cutoff=True):
    """Plotting function is used to plot the relevant data. Is able to plot
    a linear line graph, histogram and log scatter graph.  

    Parameters
    ==========

    data: arr

        The data array of values that needs to be plotted. In this case, it is the 
        history arrays that are built into the Sand Pile class.

    labels: arr
    
        The label array has 2 elements, the first being the x axis label and the 
        second being the y axis label. 
    
    plot_type: int
    
        Refers to the type of plot. 0 refers to a linear line plot. 1 refers to a histogram. 
        2 refers to a log scatter plot.
    
    filename: str
    
        The filename for the output pdf for the plot. 
    
    num_bins: int
    
        Only applies for histogram. Refers to the number of bins or intervals required for 
        the histogram. 
    
    grid_length: int
    
        Only used for log scatter plot. Used for calculating the cutoff percentage in order
        to display a linear relationship and a more accurate polyfit line by removing the 
        cutoff portion of the plot. 
        
    show_cutoff: bool
        
        Only applies for log scatter plot. Used to toggle showing the cutoff for the plot. 
        
    """
    
    # The following is used to generate a linear line plot
    if (plot_type == 0):
        pyplot.xlabel(labels[0])
        pyplot.ylabel(labels[1])
        pyplot.plot(data)
        pyplot.savefig("Line_Plots/" + filename)
    
    # The following is used to generate a histogram along with a log scatter plot by directly 
    # converting the bins of the histogram to a scatter plot
    elif (plot_type == 1):
        fig = pyplot.figure()
        ax1 = fig.add_subplot(121)
        n, bins, patches = ax1.hist(data, bins=num_bins)
        
        bins_mean = [0.5 * (bins[i] + bins[i+1]) for i in range(len(n))]
        ax2 = fig.add_subplot(122)
        ax2.scatter(bins_mean, n)
        
        ax2.set_xscale("log")
        ax2.set_yscale("log")
        
        ax1.set_xlabel(labels[0])
        ax1.set_ylabel(labels[1])
        ax1.set_title("Linear Scale")
        ax2.set_title("Log Scale")
        ax2.set_xlabel(labels[0])
        pyplot.savefig("Histograms/" + filename)
        
    # The following is used to generate a log scatter plot along with the polyfit 
    # line. Capable of toggling the cutoff portion of the plot using the cutoff
    # percentage
    else:
        
        x, y = np.unique(data, return_counts=True)
        
        # Cutoff percentage is the ratio between the perimeter and area of the grid.
        # Percentage times the total length of the data array gives the maximum 
        # slicing value. Assumes grid is a square
        if show_cutoff == False:
            cutoff_percentage = (grid_length * 4) / (grid_length * grid_length)
            x = x[:int(cutoff_percentage * len(x))]
            y = y[:int(cutoff_percentage * len(y))]
        
        pyplot.scatter(x, y)
        pyplot.xscale("log")
        pyplot.yscale("log")
        pyplot.xlabel(labels[0])
        pyplot.ylabel(labels[1])

        # Find coefficients of the equation of the line using polyfit, plot 
        # and display this equation using pyplot. Note that log of x and y 
        # are used since the plot is on a loglog scale
        logx = np.log10(x)
        logy = np.log10(y)
        
        coeff = np.polyfit(logx, logy, 1)
        pyplot.plot(10 ** logx, 10 ** (coeff[0] * logx + coeff[1]))
        equation = "log(y) =" + str("{:.2f}".format(coeff[0])) + "x" + " + " + str("{:.2f}".format(coeff[1]))
        pyplot.figtext(0.02, 0.95, equation)
        pyplot.savefig("Log_Plots/" + filename)
                
        logx = np.log10(x)
        logy = np.log10(y)
        
    pyplot.close()


def main():
    # Make sure that the output/ directory exists, or create it otherwise.
    output_dir = Path.cwd() / "output"
    if not output_dir.is_dir():
        output_dir.mkdir()
    
    # Setting up empty grid of size 100 x 100
    
    sp = SandPile(100, 100)
    
    # Mechanism for dropping the sand. After the drop_sands function is called
    # the mass and ave height of the grid will be appended to the appropriate
    # arrays. Counter is used for mass_loss since this can only be computed when
    # there are >=2 mass values in the history array. Mass loss values will also
    # be squared to avoid negative values since the log of the mass_loss array
    # will be computed. In this case, 100000 drops of sand will be dropped.
    counter = -1
    
    for k in range(100000):
        
        sp.drop_sands()
        
        sp.mass_history.append(sp.mass())
        
        sp.ave_height_history.append(sp.ave_height())
        
        if counter == -1:
            if (sp.mass() != 0):
                sp.mass_loss_history.append(sp.mass() ** 2)
        else:
            if (sp.mass_history[counter] - sp.mass()) != 0:
                sp.mass_loss_history.append((sp.mass_history[counter] - sp.mass()) ** 2)
        
        counter += 1
    
    # Calling the plotting functions to generate the different graphs
    
    create_grid(sp.grid, "grid_100", "Plot of 100 X 100 Grid")
    
    plotting(sp.length_history, ["Euclidean Length", "Frequency"], 2, "euclidean_length_polyfit_nc", 15, 100)
    
    plotting(sp.mass_loss_history, ["Mass Loss", "Frequency"], 2, "mass_loss_polyfit_nc", 100, 100)
    
    plotting(sp.topple_history, ["Topples", "Frequency"], 2, "topple_polyfit_nc", 100, 100)
    
    plotting(sp.area_history, ["Unique Sites", "Frequency"], 2, "area_polyfit_nc", 100, 100)
    
    plotting(sp.ave_height_history, ["Dropped Sand", "Average Height"], 0, "height_plot")
    
    plotting(sp.mass_history, ["Dropped Sand", "Mass"], 0, "mass_plot")
    
    example_plotting(output_dir)

if __name__ == "__main__":
    main()