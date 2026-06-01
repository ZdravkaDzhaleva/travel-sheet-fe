// Tab names and 0-based column indexes for the supporting spreadsheet (§6a).
// Header row is row 1; data starts at row 2. Column indexes are 0-based.

export const SUPPORTING_MAP = {
  company: {
    tab: 'Company',
    cols: {
      id: 0,
      name: 1,
      eik: 2,
      address: 3,
      reportingYear: 4,
    },
  },
  vehicle: {
    tab: 'Vehicle',
    cols: {
      id: 0,
      companyId: 1,
      name: 2,
      registrationNumber: 3,
      fuelType: 4,
      seatCount: 5,
      averageConsumptionLitersPer100Km: 6,
      tankCapacityLiters: 7,
      isActive: 8,
      openingFuelBalance: 9,
    },
  },
  location: {
    tab: 'Location',
    cols: {
      id: 0,
      companyId: 1,
      name: 2,
      type: 3,
      nameBg: 4,
      address: 5,
    },
  },
  route: {
    tab: 'Route',
    cols: {
      id: 0,
      routeName: 1,
      startPointId: 2,
      endPointId: 3,
      distanceKm: 4,
    },
  },
  invoice: {
    tab: 'Invoice',
    cols: {
      id: 0,
      companyId: 1,
      reportingYear: 2,
      vehicleId: 3,
      fuelVendor: 4,
      invoiceDate: 5,
      quantityLiters: 6,
      unitPrice: 7,
      totalAmount: 8,
      currency: 9,
      driveFileId: 10,
    },
  },
} as const;
