export default function DashboardComponent(props) {
  console.log(props.restaurantData);

  return (
    <section className="">
      <div>
        <div>
          <div>
            <h3>Total menus</h3>
            <p>{props.restaurantData.menus.length}</p>
          </div>

          <div>Graph</div>
        </div>

        <div>
          <div>
            <h3>Total carte</h3>
            <p>{props.restaurantData.menus.length}</p>
          </div>

          <div>Graph</div>
        </div>

        <div>
          <div>
            <h3>Total boissons</h3>
            <p>{props.restaurantData.menus.length}</p>
          </div>

          <div>Graph</div>
        </div>

        <div>
          <div>
            <h3>Total vins</h3>
            <p>{props.restaurantData.menus.length}</p>
          </div>

          <div>Graph</div>
        </div>

        <div>
          <div>
            <h3>Total actualités</h3>
            <p>{props.restaurantData.menus.length}</p>
          </div>

          <div>Graph</div>
        </div>

        <div>
          <div>
            <h3>Notifications</h3>
            <p>{props.restaurantData.menus.length}</p>
          </div>
          
          <div>Graph</div>
        </div>
      </div>

      <div></div>
    </section>
  );
}
