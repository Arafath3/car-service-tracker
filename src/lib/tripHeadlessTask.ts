export const tripDetectionTask = async (data: {
  address?: string;
  event?: string;
}) => {
  console.log(
    "[Headless] task ran! event:",
    data?.event,
    "address:",
    data?.address,
  );
};
