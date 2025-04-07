export default function FeatureItemLandingComponent({ icon, title, description }) {
  return (
    <div className="flex flex-col items-center text-center p-5 bg-white rounded-xl shadow-sm border border-darkBlue/5 hover:shadow-md transition-all duration-300 hover:border-orange/30 group">
      <div className="bg-orange/10 p-4 rounded-full text-orange text-2xl mb-4 group-hover:bg-orange/20 transition-all duration-300">
        {icon}
      </div>
      <h3 className="font-bold text-lg text-darkBlue mb-2 group-hover:text-orange transition-colors duration-300">
        {title}
      </h3>
      <p className="text-gray-600">{description}</p>
    </div>
  );
}
