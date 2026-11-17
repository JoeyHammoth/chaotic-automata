import numpy as np
import scipy as sp
import scipy.spatial


class SandPile:
    """SandPile class"""

    def __init__(self, width, height, threshold=4):
        """Initialize a sandpile with the specified width and height, setting all the 
        elements to 0. 
        
        Also contains history for the mass, mass loss, topple, area, length and average 
        height for data collecting"""
        
        self.width = width
        self.height = height
        self.threshold = threshold

        self.grid = np.zeros((width, height), dtype=int)

        # The following are history arrays for all the relevant statistics that will
        # be recorded and processed

        self.mass_history = []
        
        self.mass_loss_history = []
        
        self.topple_history = []
        
        self.area_history = []
        
        self.length_history = []
        
        self.ave_height_history = []

    def drop_sands(self, n=1, site=None):
        """Add `n` grains of sand to  the grid.  Each grains of sand is added to
        a random site.

        This function also increments the time by 1 and update the internal
        `mass_history`.  Depending on how you want to code things, you may wish
        to also run the avalanche (alternatively, the avalanching might be
        executed elsewhere).

        Parameters
        ==========

        n: int

          The number of grains of sand of drop at this time step.  If left
          unspecified, defaults to 1.

        site: arr

          The site on which the grain(s) of sand should be dropped.  If `None`,
          a random site is used.

        """
        
        # Generate a random int from 0 to width -1 and height -1 to get the index
        # of the random array from the grid
        for i in range(n):
            if site is not None:
                self.grid[site[0]][site[1]] += 1
            else:
                rand_width = np.random.randint(self.width)
                rand_height = np.random.randint(self.height)
                self.grid[rand_height][rand_width] += 1
        
        # If the site of the dropped sand reaches 4 or over, avalanche will be 
        # called to deal with the toppling
        if site is not None:
            if self.grid[site[0]][site[1]] >= 4:
                self.avalanche(site[0], site[1])
        else:
            if self.grid[rand_height][rand_width] >= 4:
                self.avalanche(rand_height, rand_width)
    
    def mass(self):
        """Return the mass of the grid."""
        
        return np.sum(self.grid)
        
    def ave_height(self):
        """Return the average height of the grid."""
        
        return self.mass() / (self.width * self.height)

    def topple(self, site):
        """Topple the specified site."""
        
        # At the specified site where it is >=4, that site is set to 0.
        self.grid[site[0]][site[1]] = 0
        
        # Change all the 4 sites surrounding the chosen site by +1. If the bordering site
        # is out of bounds, it is ignored.
        if site[0] - 1 >= 0:
            self.grid[site[0] - 1][site[1]] += 1
        
        if site[0] + 1 < self.height:
            self.grid[site[0] + 1][site[1]] += 1
        
        if site[1] - 1 >= 0:
            self.grid[site[0]][site[1] - 1] += 1
        
        if site[1] + 1 < self.width:
            self.grid[site[0]][site[1] + 1] += 1

    def avalanche(self, height, width, length_type=1):
        """Run the avalanche causing the given site to topple and deals with 
        the toppling that occurs if the toppled site produces more sites with 
        heights of >=4. It also stores the relevant stats of the avalanche in 
        the appropriate class attributes.
        
        Parameters
        ==========

        height: int

            Height of the site that is to be toppled.

        width: arr

            Width of the site that is to be toppled.
        
        length_type: int
            
            Specifying the distance used for calculating the length. 0 is for
            manhattan distance and 1 is for euclidean distance.

        """
        
        topples = 0
        
        total_sites = []
 
        # Find all the sites in the grid where it's >= 4
        sites = np.argwhere(self.grid >= 4)
        
        # While there are still >=4 in the grid, call avalanche to topple all the sites
        # with >=4. The array of sites with >=4 will update everytime this loops
        while len(sites) != 0:
            
            # All the sites will be topppled, so the number of sites found will be added
            # to the total number of topples for this avalanche. Sites will also be added
            # to the total_sites array for this avalanche
            topples += len(sites)
            total_sites.extend(sites)
            
            # Iterate through the sites array and topple each site
            for i in sites:
                self.topple(i)
            
            # Update the sites array 
            sites = np.argwhere(self.grid >= 4)
        
        
        # Append the amount of topples for this avalanche. Remove all the duplicate sites
        # from total_sites and append area_history with the number of unique sites for
        # this avalanche
        self.topple_history.append(topples)
        
        unique_sites_list = np.unique(total_sites, axis=0)
        
        self.area_history.append(len(unique_sites_list))
        
        
        # Iterate through the total_sites and find the longest distance between the initial
        # site and the site in the total_sites array. Can be computed using either Manhattan
        # distance or Euclidean distance calculations
        max_distance = 0
        
        for j in total_sites:
            if length_type == 0:
                curr_distance = abs(width - j[1]) + abs(height - j[0])
            else:
                curr_distance = np.sqrt((j[1] - width) ** 2 + (j[0] - height) ** 2)
            if curr_distance > max_distance:
                max_distance = curr_distance
        
        # Exclude any 0s since the log of the array will be computed.
        if (max_distance != 0):
            self.length_history.append(max_distance)